import { describe, expect, it } from 'vitest';
import { buildScenario, defaultFacts, templateById } from '../src/scenarios';
import type { LogStore } from '../src/session/log';
import {
  anonymizer,
  cleanCode,
  clearResearch,
  decisionsFrom,
  loadResearch,
  randomCode,
  researchStats,
  saveResearch,
  toJsonLines,
  toTranscripts,
} from '../src/session/research';
import { reduce, startSession, type Reply, type SessionState } from '../src/session/session';

function reviewing(templateId: string, facts?: Record<string, string | number>): SessionState {
  const template = templateById(templateId);
  let state = startSession({
    templateId,
    scenario: buildScenario(template, { ...defaultFacts(template), ...facts }),
    mode: 'together',
    research: true,
    now: 0,
  });
  for (const id of state.humans) {
    state = reduce(state, { type: 'lock-limits', partyId: id, values: state.limits[id], pref: state.prefs[id] });
  }
  return reduce(state, { type: 'begin-review' });
}

const answers = (state: SessionState, pick: (i: number) => Reply) =>
  Object.fromEntries(state.proposals.map((p, i) => [p.key, pick(i)]));

describe('research records', () => {
  it('records one row per answered proposal, with the figures that person was shown', () => {
    const state = reviewing('saturday-swap');
    const records = decisionsFrom(state, 'a', answers(state, (i) => (i === 0 ? 'accept' : 'decline')), 42.37, { agreed: true, code: 'P07' }, 1000);
    expect(records).toHaveLength(state.proposals.length);
    const first = records[0];
    expect(first).toMatchObject({
      session_id: state.id,
      participant: 'P07',
      scenario_id: 'saturday-swap',
      person: 'Person 1',
      role: 'Barista, part-time',
      round: 1,
      proposal: 'A',
      answer: 'accept',
      seconds_on_screen: 42.4,
      priority: 'Take-home pay',
    });
    const pay = first.figures.find((f) => f.label === 'Pay this week')!;
    expect(pay.today).toBe(363);
    expect(pay.proposed).toBe(state.proposals[0].outcomes.a.metrics.weeklyPay);
    expect(pay.change).toBeCloseTo(pay.proposed - 363, 2);
    expect(records.slice(1).every((r) => r.answer === 'decline')).toBe(true);
  });

  it('never contains anyone’s name or private limits', () => {
    const state = reviewing('holiday-weekend', { nameA: 'Zoë', nameB: 'Ana-Maria', nameC: 'Sam' });
    const records = decisionsFrom(state, 'b', answers(state, () => 'decline'), 10, { agreed: true, code: 'R-ABC123' });
    const text = JSON.stringify(records) + toTranscripts(records)[0].text;
    for (const name of ['Zoë', 'Ana-Maria', 'Sam ', 'Sam,', 'Sam.']) expect(text).not.toContain(name);
    expect(text).toContain('Person 1');
    for (const field of ['minPay', 'maxHours', 'maxWeekend', 'unavailable']) expect(text).not.toContain(field);
    for (const record of records) {
      expect(Object.keys(record).filter((key) => /limit|pref/i.test(key))).toEqual([]);
    }
  });

  it('replaces whole names only', () => {
    const scenario = buildScenario(templateById('holiday-weekend'), { ...defaultFacts(templateById('holiday-weekend')), nameC: 'Sam' });
    const anon = anonymizer(scenario);
    expect(anon('Sam covers it. Samantha and the same shift stay.')).toBe('Person 3 covers it. Samantha and the same shift stay.');
  });

  it('keeps participant codes that look like codes and replaces anything else', () => {
    expect(cleanCode(' P07 ')).toBe('P07');
    expect(cleanCode('Maya Lopez')).toMatch(/^R-[A-Z0-9]{6}$/);
    expect(cleanCode('')).toMatch(/^R-[A-Z0-9]{6}$/);
    expect(randomCode(() => 0)).toBe('R-AAAAAA');
  });
});

describe('Psych-101 style transcripts', () => {
  it('write one transcript per person per session, with choices inside << >>', () => {
    const state = reviewing('saturday-swap');
    const records = [
      ...decisionsFrom(state, 'a', answers(state, (i) => (i === 1 ? 'accept' : 'decline')), 30, { agreed: true, code: 'P01' }),
      ...decisionsFrom(state, 'b', answers(state, () => 'accept'), 20, { agreed: true, code: 'P02' }),
    ];
    const transcripts = toTranscripts(records);
    expect(transcripts).toHaveLength(2);
    const maya = transcripts.find((t) => t.participant.endsWith('/P01'))!;
    expect(maya.experiment).toBe('oxpecker/saturday-swap');
    expect(maya.text.match(/<<(yes|no)>>/g)).toEqual(['<<no>>', '<<yes>>', '<<no>>'].slice(0, state.proposals.length));
    expect(maya.text).toContain('You are Person 1, a barista, part-time.');
    // Every proposal is described before any answer is given.
    expect(maya.text.lastIndexOf('Proposal C:')).toBeLessThan(maya.text.indexOf('<<'));
  });
});

describe('research storage', () => {
  const memory = (): LogStore => {
    const data = new Map<string, string>();
    return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
  };

  it('round-trips, summarises and clears', () => {
    const store = memory();
    const state = reviewing('tip-jar');
    const records = decisionsFrom(state, 'a', answers(state, () => 'accept'), 5, { agreed: true, code: 'P03' });
    expect(saveResearch(store, records)).toBe(true);
    expect(loadResearch(store)).toEqual(records);
    expect(researchStats(records)).toEqual({ decisions: records.length, participants: 1, sessions: 1, accepted: records.length });
    expect(toJsonLines(records).trim().split('\n')).toHaveLength(records.length);
    clearResearch(store);
    expect(loadResearch(store)).toEqual([]);
    expect(loadResearch(null)).toEqual([]);
  });
});
