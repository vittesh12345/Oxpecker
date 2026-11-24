import { describe, expect, it } from 'vitest';
import { feasibleFor, partyOf, suggestedLimits, violations } from '../src/engine/engine';
import { createRng } from '../src/engine/rng';
import {
  acceptThreshold,
  simulatedConcession,
  simulatedReplies,
  simulatedSetup,
} from '../src/engine/simulate';
import type { LimitValues } from '../src/engine/types';
import { buildScenario, templateById, templates } from '../src/scenarios';
import { clearLog, entryFrom, loadLog, logStats, saveLog, toCsv, type LogStore } from '../src/session/log';
import {
  agreedProposal,
  currentParty,
  isOver,
  reduce,
  startSession,
  type Reply,
  type SessionState,
} from '../src/session/session';

const start = (id: string, mode: 'together' | 'solo' = 'together', soloRole?: string, seed = 1) =>
  startSession({ templateId: id, scenario: buildScenario(templateById(id)), mode, soloRole, seed, now: 0 });

/** Everyone locks in whatever limits they currently hold. */
function lockAll(state: SessionState, override: Record<string, LimitValues> = {}): SessionState {
  let next = state;
  for (const id of state.humans) {
    next = reduce(next, {
      type: 'lock-limits',
      partyId: id,
      values: override[id] ?? next.limits[id],
      pref: next.prefs[id],
    });
  }
  return next;
}

function replyAll(state: SessionState, reply: (partyId: string, key: string) => Reply): SessionState {
  let next = reduce(state, { type: 'begin-review' });
  for (const id of state.humans) {
    const replies = Object.fromEntries(next.proposals.map((p) => [p.key, reply(id, p.key)]));
    next = reduce(next, { type: 'submit-review', partyId: id, replies, tighten: [] });
  }
  return next;
}

describe('a session played together', () => {
  it('takes limits from each person in turn, then proposes', () => {
    let state = start('saturday-swap');
    expect(state.phase).toBe('limits');
    expect(currentParty(state)).toBe('a');

    state = reduce(state, { type: 'lock-limits', partyId: 'a', values: state.limits.a, pref: 'pay' });
    expect(state.phase).toBe('limits');
    expect(currentParty(state)).toBe('b');

    state = reduce(state, { type: 'lock-limits', partyId: 'b', values: state.limits.b, pref: 'pay' });
    expect(state.phase).toBe('proposals');
    expect(state.round).toBe(1);
    expect(state.proposals.map((p) => p.letter)).toEqual(['A', 'B', 'C']);
    expect(state.proposals[0].top).toBe(true);
  });

  it('ignores input from someone whose turn it is not', () => {
    const state = start('saturday-swap');
    const same = reduce(state, { type: 'lock-limits', partyId: 'b', values: {}, pref: 'pay' });
    expect(same).toBe(state);
  });

  it('only ever proposes arrangements inside everyone’s limits', () => {
    for (const template of templates) {
      const state = lockAll(start(template.id));
      expect(state.proposals.length).toBeGreaterThan(0);
      for (const proposal of state.proposals) {
        for (const party of state.scenario.parties) {
          expect(violations(party, state.limits[party.id], proposal.outcomes[party.id])).toEqual([]);
        }
      }
    }
  });

  it('agrees when everyone accepts the same proposal', () => {
    let state = lockAll(start('saturday-swap'));
    const target = state.proposals[1].key;
    state = replyAll(state, (_, key) => (key === target ? 'accept' : 'decline'));
    expect(state.result).toEqual({ kind: 'agreement', matches: [target], chosen: target });
    expect(isOver(state)).toBe(true);
    expect(agreedProposal(state)?.key).toBe(target);
  });

  it('asks the group to choose when more than one proposal is accepted by all', () => {
    let state = replyAll(lockAll(start('saturday-swap')), () => 'accept');
    expect(state.result?.kind).toBe('agreement');
    expect(isOver(state)).toBe(false);
    const pick = state.proposals[2].key;
    state = reduce(state, { type: 'choose', key: pick });
    expect(isOver(state)).toBe(true);
    expect(agreedProposal(state)?.key).toBe(pick);
  });

  it('reports no match without an agreement, then offers different options', () => {
    let state = lockAll(start('saturday-swap'));
    const firstRound = state.proposals.map((p) => p.key);
    state = replyAll(state, (id) => (id === 'a' ? 'accept' : 'decline'));
    expect(state.result).toEqual({ kind: 'no-match', moreOptions: true });

    state = reduce(state, { type: 'next-round' });
    expect(state.round).toBe(2);
    expect(state.proposals.length).toBeGreaterThan(0);
    expect(state.proposals.some((p) => firstRound.includes(p.key))).toBe(false);
    expect(state.proposals[0].letter).toBe('D');
  });

  it('runs out honestly when every fitting option has been declined', () => {
    let state = lockAll(start('saturday-swap'));
    state = replyAll(state, () => 'decline');
    state = reduce(state, { type: 'next-round' });
    state = replyAll(state, () => 'decline');
    expect(state.result).toEqual({ kind: 'no-match', moreOptions: false });
    state = reduce(state, { type: 'next-round' });
    expect(state.result).toEqual({ kind: 'exhausted' });
  });

  it('turns a decline reason into a tighter private limit', () => {
    let state = lockAll(start('saturday-swap'));
    state = reduce(state, { type: 'begin-review' });
    const declined = state.proposals[0];
    const pay = declined.outcomes.a.metrics.weeklyPay;
    state = reduce(state, {
      type: 'submit-review',
      partyId: 'a',
      replies: Object.fromEntries(state.proposals.map((p) => [p.key, 'decline' as Reply])),
      tighten: [{ limitId: 'minPay', key: declined.key }, { limitId: 'unavailable', slot: 'sun-open' }],
    });
    expect(state.limits.a.minPay as number).toBeGreaterThan(pay);
    expect(state.limits.a.unavailable).toEqual(['sat-late', 'sun-open']);
    // The other person's limits are untouched.
    expect(state.limits.b).toEqual(suggestedLimits(partyOf(state.scenario, 'b')));
  });

  it('can end without a deal at any point', () => {
    const state = reduce(lockAll(start('tip-jar')), { type: 'end' });
    expect(state.result).toEqual({ kind: 'ended' });
    expect(isOver(state)).toBe(true);
  });
});

describe('when limits do not overlap', () => {
  const impossible = { a: { unavailable: ['sat-late'], minPay: 385, maxHours: 26 } };

  it('says so instead of proposing something that breaks a limit', () => {
    const state = lockAll(start('saturday-swap'), impossible);
    expect(state.result).toEqual({ kind: 'no-overlap' });
    expect(state.proposals).toEqual([]);
  });

  it('tells each person privately whether one of their own limits is in the way', () => {
    let state = lockAll(start('saturday-swap'), impossible);
    state = reduce(state, { type: 'revise-limits' });
    expect(state.phase).toBe('limits');
    expect(state.revision?.reason).toBe('no-overlap');
    expect(state.revision?.nearMissFound).toBe(true);

    const nudges = state.revision!.nudges;
    expect(nudges.a.map((n) => n.limitId)).toEqual(['minPay']);
    expect(nudges.b).toEqual([]);

    // Taking the nudge is enough to get proposals.
    const relaxed = { ...state.limits.a, minPay: nudges.a[0].relaxedValue };
    state = lockAll(state, { a: relaxed });
    expect(state.phase).toBe('proposals');
  });

  it('lets a declined proposal come back after limits are revisited', () => {
    let state = lockAll(start('saturday-swap'));
    const letters = Object.fromEntries(state.proposals.map((p) => [p.key, p.letter]));
    state = replyAll(state, () => 'decline');
    state = reduce(state, { type: 'revise-limits' });
    expect(state.revision?.reason).toBe('rethink');
    state = lockAll(state);
    expect(state.proposals.every((p) => p.returning)).toBe(true);
    for (const proposal of state.proposals) expect(proposal.letter).toBe(letters[proposal.key]);
  });
});

describe('solo practice', () => {
  it('asks only the player for limits and hides the other side’s', () => {
    const state = start('keyholder-raise', 'solo', 'a', 42);
    expect(state.humans).toEqual(['a']);
    expect(state.limits.m).toBeDefined();
    const next = lockAll(state);
    expect(next.phase).toBe('proposals');
  });

  it('gives the simulated side limits no stricter than the scenario suggests', () => {
    for (const template of templates) {
      const scenario = buildScenario(template);
      for (const party of scenario.parties) {
        const { limits, pref } = simulatedSetup(party, createRng(99));
        const suggested = suggestedLimits(party);
        expect(party.priorities.map((p) => p.id)).toContain(pref);
        for (const spec of party.limits) {
          if (spec.kind === 'unavailable' || suggested[spec.id] === null) continue;
          const delta = (limits[spec.id] as number) - (suggested[spec.id] as number);
          if (spec.kind === 'min') expect(delta).toBeLessThanOrEqual(0);
          else expect(delta).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('always has something to propose at the suggested limits', () => {
    for (const template of templates) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const scenario = buildScenario(template);
        const state = lockAll(
          startSession({ templateId: template.id, scenario, mode: 'solo', soloRole: scenario.parties[0].id, seed, now: 0 }),
        );
        expect(state.phase, `${template.id} seed ${seed}`).toBe('proposals');
      }
    }
  });

  it('gets choosier answers early and easier ones later', () => {
    expect(acceptThreshold(1)).toBeGreaterThan(acceptThreshold(2));
    expect(acceptThreshold(4)).toBe(0);
    const proposal = { key: 'k', choices: {}, outcomes: {}, isBaseline: false, utilities: { m: 0.35 } };
    expect(simulatedReplies('m', [proposal], 1)).toEqual({ k: 'decline' });
    expect(simulatedReplies('m', [proposal], 2)).toEqual({ k: 'accept' });
  });

  it('reaches a deal if the player accepts everything for long enough', () => {
    for (const template of templates) {
      const scenario = buildScenario(template);
      let state = lockAll(
        startSession({ templateId: template.id, scenario, mode: 'solo', soloRole: scenario.parties[0].id, seed: 7, now: 0 }),
      );
      for (let guard = 0; guard < 12 && state.result?.kind !== 'agreement'; guard++) {
        state = replyAll(state, () => 'accept');
        if (state.result?.kind === 'no-match') {
          state = state.result.moreOptions
            ? reduce(state, { type: 'next-round' })
            : lockAll(reduce(state, { type: 'revise-limits' }));
        }
      }
      expect(state.result?.kind, template.id).toBe('agreement');
    }
  });

  it('moves a simulated limit only for a small gap, and never availability', () => {
    const scenario = buildScenario(templateById('saturday-swap'));
    const jordan = partyOf(scenario, 'b');
    const values = suggestedLimits(jordan);
    const small = simulatedConcession(jordan, values, [{ limitId: 'minPay', kind: 'min', gap: 15, actual: 380 }]);
    expect(small).toEqual({ moved: true, values: { ...values, minPay: 380 } });
    const large = simulatedConcession(jordan, values, [{ limitId: 'minPay', kind: 'min', gap: 95, actual: 300 }]);
    expect(large.moved).toBe(false);
    const shift = simulatedConcession(jordan, values, [{ limitId: 'unavailable', kind: 'unavailable', slots: ['sun-open'] }]);
    expect(shift).toEqual({ moved: false, values });
  });

  it('has the simulated side give a little when nothing overlaps', () => {
    const scenario = buildScenario(templateById('keyholder-raise'));
    let state = startSession({ templateId: 'keyholder-raise', scenario, mode: 'solo', soloRole: 'a', seed: 3, now: 0 });
    // Dana asks for slightly more than the manager's hidden budget allows.
    const dana = { ...state.limits.a, minPay: (state.limits.m.maxCost as number) + 10, minRate: null };
    state = lockAll(state, { a: dana });
    expect(state.result).toEqual({ kind: 'no-overlap' });
    const budgetBefore = state.limits.m.maxCost as number;

    state = reduce(state, { type: 'revise-limits' });
    expect(state.othersMoved).toBe(true);
    expect(state.limits.m.maxCost as number).toBeGreaterThan(budgetBefore);
    expect(feasibleFor(scenario, state.limits).length).toBeGreaterThan(0);
  });
});

describe('practice log', () => {
  const memoryStore = (): LogStore => {
    const data = new Map<string, string>();
    return {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
      removeItem: (key) => void data.delete(key),
    };
  };

  const finished = () => {
    const state = lockAll(start('saturday-swap'));
    const target = state.proposals[0].key;
    return replyAll(state, (_, key) => (key === target ? 'accept' : 'decline'));
  };

  it('records how the session went', () => {
    const entry = entryFrom(finished(), { fairness: 4, participant: ' P07 ', notes: 'Felt even.' }, 150000);
    expect(entry).toMatchObject({
      scenarioId: 'saturday-swap',
      category: 'shift-trade',
      mode: 'together',
      people: 2,
      outcome: 'agreement',
      rounds: 1,
      minutes: 2.5,
      fairness: 4,
      participant: 'P07',
      notes: 'Felt even.',
    });
  });

  it('never stores anyone’s limits, priorities or replies', () => {
    const entry = entryFrom(finished(), { fairness: null, participant: '', notes: '' }, 1000);
    const text = JSON.stringify(entry);
    for (const word of ['limits', 'minPay', 'unavailable', 'prefs', 'replies', 'sat-late']) {
      expect(text).not.toContain(word);
    }
  });

  it('counts a walk-away as no deal', () => {
    const state = reduce(lockAll(start('tip-jar')), { type: 'end' });
    expect(entryFrom(state, { fairness: 2, participant: '', notes: '' }, 0).outcome).toBe('no-deal');
  });

  it('round-trips through storage and survives bad data', () => {
    const store = memoryStore();
    expect(loadLog(store)).toEqual([]);
    const entry = entryFrom(finished(), { fairness: 5, participant: 'P01', notes: '' }, 60000);
    expect(saveLog(store, [entry])).toBe(true);
    expect(loadLog(store)).toEqual([entry]);
    clearLog(store);
    expect(loadLog(store)).toEqual([]);

    store.setItem('oxpecker.practice-log.v1', '{not json');
    expect(loadLog(store)).toEqual([]);
    expect(loadLog(null)).toEqual([]);
    expect(saveLog(null, [entry])).toBe(false);
  });

  it('summarises sessions', () => {
    const deal = entryFrom(finished(), { fairness: 4, participant: 'P01', notes: '' }, 60000);
    const none = { ...deal, id: 'x', outcome: 'no-deal' as const, rounds: 3, fairness: null, participant: 'P02' };
    expect(logStats([deal, none])).toEqual({
      sessions: 2,
      agreements: 1,
      agreementRate: 0.5,
      averageRounds: 2,
      averageFairness: 4,
      participants: 2,
    });
    expect(logStats([]).agreementRate).toBeNull();
  });

  it('exports CSV that quotes commas and defuses formulas', () => {
    const entry = entryFrom(finished(), { fairness: 3, participant: 'P01', notes: '=SUM(A1), "odd"' }, 60000);
    const [header, row] = toCsv([entry]).split('\n');
    expect(header.split(',')).toContain('fairness');
    expect(row).toContain(`"'=SUM(A1), ""odd"""`);
  });
});
