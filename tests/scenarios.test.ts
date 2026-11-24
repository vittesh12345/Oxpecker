import { describe, expect, it } from 'vitest';
import {
  allCandidates,
  baselineOf,
  feasibleFor,
  suggestedLimits,
  violations,
} from '../src/engine/engine';
import type { Scenario } from '../src/engine/types';
import { buildScenario, defaultFacts, templateById, templates } from '../src/scenarios';

const suggestedFor = (s: Scenario) =>
  Object.fromEntries(s.parties.map((p) => [p.id, suggestedLimits(p)]));
const outcomesOf = (id: string, key: string) =>
  allCandidates(buildScenario(templateById(id))).find((c) => c.key === key)!.outcomes;

describe('scenario library', () => {
  it('has eight scenarios across shift trades, tip splits and wage talks', () => {
    expect(templates).toHaveLength(8);
    expect(new Set(templates.map((t) => t.id)).size).toBe(8);
    const count = (category: string) => templates.filter((t) => t.category === category).length;
    expect(count('shift-trade')).toBe(3);
    expect(count('tip-split')).toBe(3);
    expect(count('wage')).toBe(2);
  });

  for (const template of templates) {
    describe(template.title, () => {
      const s = buildScenario(template);
      const all = allCandidates(s);

      it('matches its template card', () => {
        expect(s.id).toBe(template.id);
        expect(s.category).toBe(template.category);
        expect(s.recurring).toBe(template.recurring);
        expect(s.story.length).toBeGreaterThan(0);
      });

      it('has a valid status quo', () => {
        expect(baselineOf(s).isBaseline).toBe(true);
        for (const issue of s.issues) {
          expect(issue.options.map((o) => o.id)).toContain(s.baseline[issue.id]);
        }
      });

      it('projects every number it promises, for every arrangement', () => {
        for (const candidate of all) {
          for (const party of s.parties) {
            const outcome = candidate.outcomes[party.id];
            for (const metric of party.metrics) {
              expect(Number.isFinite(outcome.metrics[metric.key]), `${party.name} ${metric.key}`).toBe(true);
            }
            for (const limit of party.limits) {
              if (limit.kind !== 'unavailable') {
                expect(Number.isFinite(outcome.metrics[limit.metric]), `${party.name} ${limit.metric}`).toBe(true);
              }
            }
            for (const slot of outcome.shifts) {
              expect(s.slots.map((x) => x.id)).toContain(slot);
            }
          }
        }
      });

      it('gives every priority weights over numbers it projects', () => {
        for (const party of s.parties) {
          expect(party.priorities.length).toBeGreaterThan(0);
          for (const priority of party.priorities) {
            for (const key of Object.keys(priority.weights)) {
              expect(baselineOf(s).outcomes[party.id].metrics[key], `${party.name} ${key}`).toBeDefined();
            }
          }
        }
      });

      it('keeps suggested limits inside their adjustable range', () => {
        for (const party of s.parties) {
          for (const limit of party.limits) {
            if (limit.kind === 'unavailable') {
              for (const slot of limit.suggested) expect(limit.slots).toContain(slot);
            } else if (limit.suggested !== null) {
              expect(limit.suggested).toBeGreaterThanOrEqual(limit.lo);
              expect(limit.suggested).toBeLessThanOrEqual(limit.hi);
            }
          }
        }
      });

      it('starts from a real conflict: the status quo breaks someone’s suggested limit', () => {
        const limits = suggestedFor(s);
        const base = baselineOf(s);
        const broken = s.parties.flatMap((p) => violations(p, limits[p.id], base.outcomes[p.id]));
        expect(broken.length).toBeGreaterThan(0);
      });

      it('can be solved: at least three arrangements fit the suggested limits', () => {
        expect(feasibleFor(s, suggestedFor(s)).length).toBeGreaterThanOrEqual(3);
      });

      it('rebuilds with different names and figures', () => {
        const facts = defaultFacts(template);
        for (const fact of template.facts) {
          if (fact.kind === 'text') facts[fact.id] = `${fact.value}-X`;
        }
        const rebuilt = buildScenario(template, facts);
        expect(rebuilt.parties.every((p) => p.name.endsWith('-X'))).toBe(true);
        expect(allCandidates(rebuilt).length).toBe(all.length);
      });
    });
  }
});

describe('pay arithmetic', () => {
  it('Saturday swap: hours times wage, per person', () => {
    const now = outcomesOf('saturday-swap', 'a|b|b');
    expect(now.a.metrics).toMatchObject({ weeklyPay: 363, weeklyHours: 22, weekendHours: 8 });
    expect(now.b.metrics).toMatchObject({ weeklyPay: 414, weeklyHours: 24, weekendHours: 6 });

    const split = outcomesOf('saturday-swap', 'split|b|a');
    expect(split.a.metrics).toMatchObject({ weeklyPay: 379.5, weeklyHours: 23 });
    expect(split.b.metrics).toMatchObject({ weeklyPay: 396.75, weeklyHours: 23 });
    expect(split.a.shifts).toEqual(['sat-early', 'wed-eve']);
    expect(split.b.shifts).toEqual(['sat-late', 'sun-open']);
  });

  it('Holiday weekend: the premium applies to holiday hours only', () => {
    const now = outcomesOf('holiday-weekend', 'b|a|b');
    expect(now.a.metrics.weeklyPay).toBe(20 * 17 + 8 * 19);
    expect(now.b.metrics.weeklyPay).toBe(16 * 16.25 + 16 * 18.25);
    expect(now.c.metrics.weeklyPay).toBe(24 * 18.5);
  });

  it('Last bus: differentials follow whoever closes', () => {
    const now = outcomesOf('last-bus', 'a|a|a|b');
    expect(now.a.metrics).toMatchObject({ weeklyPay: 613.6, weeklyHours: 32, lateCloses: 3 });
    expect(now.b.metrics).toMatchObject({ weeklyPay: 540.8, weeklyHours: 32, lateCloses: 0 });

    const swapped = outcomesOf('last-bus', 'b|b|a|a');
    expect(swapped.a.metrics).toMatchObject({ weeklyPay: 589.6, lateCloses: 1 });
    expect(swapped.b.metrics).toMatchObject({ weeklyPay: 564.8, lateCloses: 2 });
  });

  it('Kitchen share: the three shares always add up to the whole pool', () => {
    const s = buildScenario(templateById('kitchen-share'));
    for (const candidate of allCandidates(s)) {
      const tips = s.parties.reduce((sum, p) => sum + candidate.outcomes[p.id].metrics.weeklyTips, 0);
      expect(tips).toBeCloseTo(900, 2);
    }
    expect(outcomesOf('kitchen-share', '15|15').a.metrics.weeklyPay).toBe(28 * 16 + 630);
  });

  it('Tip jar: every method pays out the whole jar', () => {
    const s = buildScenario(templateById('tip-jar'));
    for (const candidate of allCandidates(s)) {
      const tips = s.parties.reduce((sum, p) => sum + candidate.outcomes[p.id].metrics.weeklyTips, 0);
      expect(tips).toBeCloseTo(540, 1);
    }
    const byHours = outcomesOf('tip-jar', 'hours|1.5');
    expect(byHours.a.metrics.weeklyTips).toBe(270);
    expect(byHours.b.metrics.weeklyTips).toBe(148.5);
    expect(byHours.c.metrics.weeklyTips).toBe(121.5);
  });

  it('Tip jar: splits equally when nobody has hours to weigh', () => {
    const template = templateById('tip-jar');
    const facts = { ...defaultFacts(template), weekendA: 0, weekendB: 0, weekendC: 0, weekdayC: 10 };
    const days = allCandidates(buildScenario(template, facts)).find((c) => c.key === 'days|1')!;
    const tips = ['a', 'b', 'c'].map((id) => days.outcomes[id].metrics.weeklyTips);
    expect(tips.reduce((sum, t) => sum + t, 0)).toBeCloseTo(540, 1);
  });

  it('Friday dinner: tips move with the shift, and shared tips are not double-counted', () => {
    const s = buildScenario(templateById('friday-dinner'));
    const total = (key: string) => {
      const o = allCandidates(s).find((c) => c.key === key)!.outcomes;
      return o.a.metrics.weeklyPay + o.b.metrics.weeklyPay;
    };
    const now = outcomesOf('friday-dinner', 'a|a|0');
    expect(now.a.metrics.weeklyPay).toBe(1228);
    expect(now.b.metrics.weeklyPay).toBe(709);
    // Sharing tips or swapping shifts moves money between the two, never creates it.
    for (const candidate of allCandidates(s)) expect(total(candidate.key)).toBeCloseTo(1937, 2);
    expect(outcomesOf('friday-dinner', 'alt|a|10').a.metrics.primeDinners).toBe(1.5);
  });

  it('Wage talks: what the worker is paid is what the role costs', () => {
    for (const id of ['keyholder-raise', 'outside-offer']) {
      for (const candidate of allCandidates(buildScenario(templateById(id)))) {
        expect(candidate.outcomes.a.metrics.weeklyPay).toBe(candidate.outcomes.m.metrics.laborCost);
      }
    }
    expect(outcomesOf('keyholder-raise', '1.25|28|3').a.metrics).toMatchObject({
      weeklyPay: 504, hourlyRate: 18, weeklyHours: 28, lateCloses: 3,
    });
    expect(outcomesOf('outside-offer', '0.6|38|3').a.metrics).toMatchObject({
      weeklyPay: 722, hourlyRate: 19, weekendShifts: 3,
    });
  });
});
