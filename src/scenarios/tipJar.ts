import type { Party, Scenario, ScenarioTemplate } from '../engine/types';
import {
  floorTo,
  metrics,
  money,
  num,
  payFloor,
  payOnly,
  rateFloor,
  text,
  workerOutcome,
} from './helpers';

type Id = 'a' | 'b' | 'c';
const IDS: Id[] = ['a', 'b', 'c'];

/** One counter tip jar, three people with very different weeks. */
export const tipJar: ScenarioTemplate = {
  id: 'tip-jar',
  category: 'tip-split',
  title: 'The tip jar',
  setting: 'Café counter',
  summary:
    'Equal thirds, or by the hour? The full-timer, the part-timer and the weekend regular each have a different answer.',
  people: '3 coworkers',
  recurring: true,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Nia', group: 'Full-timer' },
    { id: 'wageA', label: 'Hourly wage', kind: 'money', value: 17.5, min: 7, max: 60, step: 0.05, group: 'Full-timer' },
    { id: 'weekdayA', label: 'Weekday hours', kind: 'number', value: 28, min: 0, max: 50, step: 1, group: 'Full-timer' },
    { id: 'weekendA', label: 'Weekend hours', kind: 'number', value: 8, min: 0, max: 24, step: 1, group: 'Full-timer' },
    { id: 'nameB', label: 'Name', kind: 'text', value: 'Owen', group: 'Part-timer' },
    { id: 'wageB', label: 'Hourly wage', kind: 'money', value: 16, min: 7, max: 60, step: 0.05, group: 'Part-timer' },
    { id: 'weekdayB', label: 'Weekday hours', kind: 'number', value: 16, min: 0, max: 50, step: 1, group: 'Part-timer' },
    { id: 'weekendB', label: 'Weekend hours', kind: 'number', value: 4, min: 0, max: 24, step: 1, group: 'Part-timer' },
    { id: 'nameC', label: 'Name', kind: 'text', value: 'Bea', group: 'Weekends only' },
    { id: 'wageC', label: 'Hourly wage', kind: 'money', value: 16, min: 7, max: 60, step: 0.05, group: 'Weekends only' },
    { id: 'weekdayC', label: 'Weekday hours', kind: 'number', value: 0, min: 0, max: 50, step: 1, group: 'Weekends only' },
    { id: 'weekendC', label: 'Weekend hours', kind: 'number', value: 12, min: 0, max: 24, step: 1, group: 'Weekends only' },
    { id: 'jar', label: 'Tips in the jar each week', kind: 'money', value: 540, min: 30, max: 5000, step: 10, group: 'Tip jar' },
    { id: 'weekendShare', label: 'Percent of the jar that comes in on the weekend', kind: 'number', value: 50, min: 0, max: 100, step: 5, group: 'Tip jar' },
  ],
  build(facts): Scenario {
    const names: Record<Id, string> = {
      a: text(facts, 'nameA', 'Nia'),
      b: text(facts, 'nameB', 'Owen'),
      c: text(facts, 'nameC', 'Bea'),
    };
    const wage: Record<Id, number> = { a: num(facts, 'wageA'), b: num(facts, 'wageB'), c: num(facts, 'wageC') };
    const weekday: Record<Id, number> = { a: num(facts, 'weekdayA'), b: num(facts, 'weekdayB'), c: num(facts, 'weekdayC') };
    const weekend: Record<Id, number> = { a: num(facts, 'weekendA'), b: num(facts, 'weekendB'), c: num(facts, 'weekendC') };
    const jar = num(facts, 'jar');
    const weekendPot = (jar * num(facts, 'weekendShare')) / 100;
    const hours = (id: Id) => weekday[id] + weekend[id];
    const sum = (of: (id: Id) => number) => IDS.reduce((total, id) => total + of(id), 0);

    /** Splits an amount in proportion to a per-person weight, equally if nobody has any. */
    const proportional = (amount: number, weight: (id: Id) => number): Record<Id, number> => {
      const total = sum(weight);
      const share = (id: Id) => (total > 0 ? weight(id) / total : 1 / IDS.length);
      return { a: amount * share('a'), b: amount * share('b'), c: amount * share('c') };
    };

    const tipsFor = (c: Record<string, string>): Record<Id, number> => {
      const multiplier = Number(c.weight);
      const equal = proportional(jar, () => 1);
      const byHours = proportional(jar, (id) => weekday[id] + multiplier * weekend[id]);
      switch (c.method) {
        case 'hours':
          return byHours;
        case 'blend':
          return {
            a: (equal.a + byHours.a) / 2,
            b: (equal.b + byHours.b) / 2,
            c: (equal.c + byHours.c) / 2,
          };
        case 'days': {
          const sat = proportional(weekendPot, (id) => weekend[id]);
          const week = proportional(jar - weekendPot, (id) => weekday[id]);
          return { a: sat.a + week.a, b: sat.b + week.b, c: sat.c + week.c };
        }
        default:
          return equal;
      }
    };

    const evaluate: Scenario['evaluate'] = (c) => {
      const tips = tipsFor(c);
      const result: ReturnType<Scenario['evaluate']> = {};
      for (const id of IDS) {
        result[id] = workerOutcome(wage[id] * hours(id) + tips[id], hours(id), {
          weekendHours: weekend[id],
          extra: { weeklyTips: Math.round(tips[id] * 100) / 100 },
        });
      }
      return result;
    };

    const base = (id: Id) => wage[id] * hours(id);
    const shared = {
      kind: 'worker' as const,
      metrics: [metrics.pay(), metrics.tips(), metrics.rate(), metrics.hours()],
      priorities: payOnly,
    };
    const effective = { label: 'Lowest effective hourly I can accept' };
    const floors = { a: (jar * 5) / 12, b: jar * 0.26, c: jar * 0.22 };

    const parties: Party[] = [
      {
        ...shared,
        id: 'a',
        name: names.a,
        role: 'Barista, full-time',
        publicBrief: 'Works the most hours by far. Says an equal split shortchanges the people who are there all week.',
        privateBrief: `You work ${hours('a')} hours and take home the same tips as someone who works ${hours('c')}. You want the split to follow hours. You’d accept a compromise, but only if your tips come to about ${money(floors.a)} a week or more.`,
        limits: [payFloor(floorTo(base('a') + floors.a, 5), base('a') + jar / 3), rateFloor(null, wage.a, effective)],
      },
      {
        ...shared,
        id: 'b',
        name: names.b,
        role: 'Barista, part-time',
        publicBrief: 'Happy with the equal split. Worried that a change will cut into their tips.',
        privateBrief:
          'The equal split works well for you. You expect to lose a little if it changes, and you can absorb that, but not a big cut.',
        limits: [payFloor(floorTo(base('b') + floors.b, 5), base('b') + jar / 3), rateFloor(null, wage.b, effective)],
      },
      {
        ...shared,
        id: 'c',
        name: names.c,
        role: 'Barista, weekends only',
        publicBrief: 'Works only Saturday and Sunday, the busiest days. Says weekend shifts fill most of the jar.',
        privateBrief:
          'Your two shifts are the busiest of the week. A plain by-hours split would cut your tips nearly in half, and at that point the job stops being worth the bus fare.',
        limits: [payFloor(floorTo(base('c') + floors.c, 5), base('c') + jar / 3), rateFloor(null, wage.c, effective)],
      },
    ];

    return {
      id: 'tip-jar',
      category: 'tip-split',
      title: 'The tip jar',
      setting: 'Café counter',
      summary: tipJar.summary,
      recurring: true,
      caution:
        'Tip-pooling rules differ by state and country. Check the rules where you work before changing a real split.',
      story: [
        `The counter jar brings in about ${money(jar)} a week and has always been split in equal thirds. About ${num(facts, 'weekendShare')}% of it comes in on Saturday and Sunday.`,
        `${names.a} works ${hours('a')} hours a week, ${names.b} works ${hours('b')}, and ${names.c} works ${hours('c')}, all of them on the weekend.`,
        'The owner will pay out the jar however the three of them agree to split it.',
      ],
      parties,
      slots: [],
      issues: [
        {
          id: 'method',
          label: 'How the jar is split',
          options: [
            { id: 'equal', label: 'Equal thirds' },
            { id: 'hours', label: 'By hours worked' },
            { id: 'days', label: 'Tips stay with the days they came in' },
            { id: 'blend', label: 'Half in equal thirds, half by hours' },
          ],
        },
        {
          id: 'weight',
          label: 'A weekend hour counts as',
          options: [
            { id: '1', label: 'One hour, same as a weekday' },
            { id: '1.25', label: '1.25 hours' },
            { id: '1.5', label: '1.5 hours' },
          ],
        },
      ],
      baseline: { method: 'equal', weight: '1' },
      isValid: (c) => c.weight === '1' || c.method === 'hours' || c.method === 'blend',
      evaluate,
    };
  },
};
