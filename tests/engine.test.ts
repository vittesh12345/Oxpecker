import { describe, expect, it } from 'vitest';
import {
  allCandidates,
  baselineOf,
  countFitting,
  describeChoices,
  feasibleFor,
  fitsEveryone,
  nearestMiss,
  partyOf,
  pickProposals,
  rank,
  relaxTo,
  suggestedLimits,
  tightenPast,
  tradeoffs,
  utilityTable,
  violations,
} from '../src/engine/engine';
import { createRng, intBetween, pick } from '../src/engine/rng';
import type { LimitValues, NumericLimitSpec, Scenario } from '../src/engine/types';
import { buildScenario, templateById, templates } from '../src/scenarios';

const scenario = (id: string) => buildScenario(templateById(id));
const suggestedFor = (s: Scenario) =>
  Object.fromEntries(s.parties.map((p) => [p.id, suggestedLimits(p)]));
const firstPrefs = (s: Scenario) =>
  Object.fromEntries(s.parties.map((p) => [p.id, p.priorities[0].id]));

describe('candidates', () => {
  it('enumerates every valid combination exactly once', () => {
    const s = scenario('saturday-swap');
    const all = allCandidates(s);
    expect(all).toHaveLength(3 * 2 * 2);
    expect(new Set(all.map((c) => c.key)).size).toBe(all.length);
    expect(all.filter((c) => c.isBaseline)).toHaveLength(1);
  });

  it('drops combinations the scenario rules out', () => {
    const s = scenario('holiday-weekend');
    const all = allCandidates(s);
    expect(all).toHaveLength(18);
    expect(all.every((c) => c.choices['sat-open'] !== c.choices['sat-close'])).toBe(true);
  });
});

describe('limits', () => {
  const s = scenario('saturday-swap');
  const maya = partyOf(s, 'a');
  const base = baselineOf(s);

  it('flags a shift the person cannot work', () => {
    const found = violations(maya, { unavailable: ['sat-late'] }, base.outcomes.a);
    expect(found).toEqual([{ limitId: 'unavailable', kind: 'unavailable', slots: ['sat-late'] }]);
  });

  it('flags pay under a floor and reports the gap', () => {
    const found = violations(maya, { minPay: 400 }, base.outcomes.a);
    expect(found).toEqual([{ limitId: 'minPay', kind: 'min', gap: 37, actual: 363 }]);
  });

  it('flags hours over a ceiling', () => {
    const found = violations(maya, { maxHours: 20 }, base.outcomes.a);
    expect(found).toEqual([{ limitId: 'maxHours', kind: 'max', gap: 2, actual: 22 }]);
  });

  it('treats a limit that is switched off as no limit', () => {
    expect(violations(maya, { minPay: null, maxHours: null, unavailable: [] }, base.outcomes.a)).toEqual([]);
  });

  it('accepts a figure that lands exactly on the limit', () => {
    expect(violations(maya, { minPay: 363, maxHours: 22 }, base.outcomes.a)).toEqual([]);
  });

  it('counts fitting arrangements from one person’s limits alone', () => {
    const open = countFitting(s, 'a', { unavailable: [], minPay: null, maxHours: null });
    expect(open).toEqual({ fit: 11, total: 11 });
    const tight = countFitting(s, 'a', suggestedLimits(maya));
    expect(tight.fit).toBeLessThan(11);
    expect(tight.fit).toBeGreaterThan(0);
  });
});

describe('proposals respect every private limit', () => {
  it('never offers the status quo', () => {
    for (const template of templates) {
      const s = buildScenario(template);
      const open = Object.fromEntries(s.parties.map((p) => [p.id, {} as LimitValues]));
      expect(feasibleFor(s, open).some((c) => c.isBaseline)).toBe(false);
    }
  });

  it('holds for random limits in every scenario', () => {
    const rng = createRng(20240611);
    for (const template of templates) {
      const s = buildScenario(template);
      for (let trial = 0; trial < 60; trial++) {
        const limits: Record<string, LimitValues> = {};
        for (const party of s.parties) {
          const values: LimitValues = {};
          for (const spec of party.limits) {
            if (spec.kind === 'unavailable') {
              values[spec.id] = spec.slots.filter(() => rng() < 0.25);
            } else if (rng() < 0.2) {
              values[spec.id] = null;
            } else {
              const steps = Math.floor((spec.hi - spec.lo) / spec.step);
              values[spec.id] = spec.lo + intBetween(rng, 0, steps) * spec.step;
            }
          }
          limits[party.id] = values;
        }

        const feasible = feasibleFor(s, limits);
        const ranked = rank(s, feasible, firstPrefs(s));
        const offered = pickProposals(s, ranked, new Set());
        for (const proposal of offered) {
          for (const party of s.parties) {
            expect(violations(party, limits[party.id], proposal.outcomes[party.id])).toEqual([]);
          }
        }
        // And nothing that fits everyone was wrongly left out.
        const fitting = allCandidates(s).filter((c) => !c.isBaseline && fitsEveryone(s, limits, c));
        expect(feasible.map((c) => c.key).sort()).toEqual(fitting.map((c) => c.key).sort());
      }
    }
  });
});

describe('ranking', () => {
  it('scores each person between 0 and 1 across the feasible set', () => {
    const s = scenario('tip-jar');
    const feasible = feasibleFor(s, suggestedFor(s));
    const table = utilityTable(s, feasible, firstPrefs(s));
    for (const party of s.parties) {
      const scores = feasible.map((c) => table[c.key][party.id]);
      expect(Math.min(...scores)).toBeCloseTo(0);
      expect(Math.max(...scores)).toBeCloseTo(1);
    }
  });

  it('puts the option with the best-off worst-off person first', () => {
    const s = scenario('tip-jar');
    const ranked = rank(s, feasibleFor(s, suggestedFor(s)), firstPrefs(s));
    const worst = (r: (typeof ranked)[number]) => Math.min(...Object.values(r.utilities));
    for (const other of ranked.slice(1)) {
      expect(worst(ranked[0])).toBeGreaterThanOrEqual(worst(other) - 1e-9);
    }
  });

  it('is unmoved by a priority when the numbers behind it do not vary', () => {
    const s = scenario('kitchen-share');
    const feasible = feasibleFor(s, suggestedFor(s));
    const table = utilityTable(s, feasible, { a: 'unknown', b: 'pay', c: 'pay' });
    expect(Object.keys(table)).toHaveLength(feasible.length);
  });

  it('follows a person’s stated priority', () => {
    const s = scenario('last-bus');
    const open = { a: { maxCloses: null, minPay: null, unavailable: [] }, b: {} };
    const feasible = feasibleFor(s, open);
    const byPay = utilityTable(s, feasible, { a: 'pay', b: 'pay' });
    const byNights = utilityTable(s, feasible, { a: 'other', b: 'pay' });
    const best = (table: typeof byPay) =>
      feasible.reduce((top, c) => (table[c.key].a > table[top.key].a ? c : top));
    expect(best(byNights).outcomes.a.metrics.lateCloses).toBe(0);
    expect(best(byPay).outcomes.a.metrics.weeklyPay).toBe(
      Math.max(...feasible.map((c) => c.outcomes.a.metrics.weeklyPay)),
    );
  });

  it('is deterministic', () => {
    const s = scenario('keyholder-raise');
    const run = () => rank(s, feasibleFor(s, suggestedFor(s)), firstPrefs(s)).map((r) => r.key);
    expect(run()).toEqual(run());
  });
});

describe('picking a round of proposals', () => {
  const s = scenario('keyholder-raise');
  const open = { a: {}, m: {} };
  const ranked = rank(s, feasibleFor(s, open), firstPrefs(s));

  it('offers up to three, best first', () => {
    const picks = pickProposals(s, ranked, new Set());
    expect(picks).toHaveLength(3);
    expect(picks[0].key).toBe(ranked[0].key);
    const order = picks.map((p) => ranked.indexOf(p));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('skips anything already offered', () => {
    const first = pickProposals(s, ranked, new Set());
    const seen = new Set(first.map((p) => p.key));
    const second = pickProposals(s, ranked, seen);
    expect(second.some((p) => seen.has(p.key))).toBe(false);
  });

  it('prefers options that differ in more than one respect', () => {
    const picks = pickProposals(s, ranked, new Set());
    const differing = (a: (typeof picks)[number], b: (typeof picks)[number]) =>
      s.issues.filter((i) => a.choices[i.id] !== b.choices[i.id]).length;
    expect(differing(picks[0], picks[1])).toBeGreaterThanOrEqual(2);
  });

  it('returns nothing once every option has been offered', () => {
    expect(pickProposals(s, ranked, new Set(ranked.map((r) => r.key)))).toEqual([]);
  });
});

describe('moving limits', () => {
  const floor: NumericLimitSpec = {
    id: 'minPay', kind: 'min', metric: 'weeklyPay', label: '', unit: 'money',
    lo: 0, hi: 1000, step: 5, suggested: null, declineLabel: '',
  };
  const ceiling: NumericLimitSpec = { ...floor, id: 'maxHours', kind: 'max', metric: 'weeklyHours', step: 1 };

  it('tightens a floor to just above the declined figure', () => {
    expect(tightenPast(floor, null, 297)).toBe(300);
    expect(tightenPast(floor, 290, 297)).toBe(300);
    expect(tightenPast(floor, 300, 300)).toBe(305);
  });

  it('tightens a ceiling to just below the declined figure', () => {
    expect(tightenPast(ceiling, null, 28)).toBe(27);
    expect(tightenPast(ceiling, 30, 27.5)).toBe(27);
  });

  it('never loosens a limit that is already stricter', () => {
    expect(tightenPast(floor, 350, 297)).toBe(350);
    expect(tightenPast(ceiling, 20, 28)).toBe(20);
  });

  it('relaxes to the nearest step that admits the figure', () => {
    expect(relaxTo(floor, 297)).toBe(295);
    expect(relaxTo(floor, 300)).toBe(300);
    expect(relaxTo(ceiling, 27.5)).toBe(28);
  });
});

describe('nearest miss', () => {
  it('finds the closest arrangement and who it falls short for', () => {
    const s = scenario('saturday-swap');
    const limits = suggestedFor(s);
    limits.a = { ...limits.a, minPay: 400 };
    expect(feasibleFor(s, limits)).toEqual([]);

    const miss = nearestMiss(s, limits)!;
    expect(miss).not.toBeNull();
    const all = [...miss.byParty.a, ...miss.byParty.b];
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((v) => v.kind !== 'unavailable')).toBe(true);

    // Relaxing exactly the limits it names makes that arrangement feasible.
    for (const party of s.parties) {
      for (const v of miss.byParty[party.id]) {
        const spec = party.limits.find((l) => l.id === v.limitId) as NumericLimitSpec;
        limits[party.id] = { ...limits[party.id], [spec.id]: relaxTo(spec, v.actual!) };
      }
    }
    expect(feasibleFor(s, limits).map((c) => c.key)).toContain(miss.candidate.key);
  });

  it('returns null when availability alone rules everything out', () => {
    const s = scenario('saturday-swap');
    const all = s.slots.map((slot) => slot.id);
    const limits = { a: { unavailable: all }, b: { unavailable: all } };
    expect(nearestMiss(s, limits)).toBeNull();
  });
});

describe('describing an arrangement', () => {
  const s = scenario('saturday-swap');

  it('marks what differs from how things stand', () => {
    const lines = describeChoices(s, { sat: 'b', sun: 'a', wed: 'b' });
    expect(lines.map((l) => l.changed)).toEqual([true, true, false]);
    expect(lines[0].option).toBe('Jordan covers all of it');
  });

  it('sorts changes into gains, costs and the rest', () => {
    const maya = partyOf(s, 'a');
    const base = baselineOf(s).outcomes.a;
    const swap = allCandidates(s).find((c) => c.key === 'b|a|b')!.outcomes.a;
    const result = tradeoffs(s, maya, swap, base);
    expect(result.costs).toContain('Pay this week down $33.00');
    expect(result.gains).toContain('Weekend hours down 2 h');
    expect(result.other).toContain('Adds Sunday open');
    expect(result.other).toContain('Drops Saturday close, second half');
  });
});

describe('seeded generator', () => {
  it('repeats for the same seed and stays in range', () => {
    const a = createRng(7);
    const b = createRng(7);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
    const rng = createRng(3);
    for (let i = 0; i < 200; i++) {
      const n = intBetween(rng, 2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
      expect(['x', 'y']).toContain(pick(rng, ['x', 'y']));
    }
  });
});
