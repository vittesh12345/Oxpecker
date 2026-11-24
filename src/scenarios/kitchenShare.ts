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

const KITCHEN = [0, 10, 15, 20, 25];
const FLOOR = [10, 15, 20];

/** Front of house against back of house over one weekly tip pool. */
export const kitchenShare: ScenarioTemplate = {
  id: 'kitchen-share',
  category: 'tip-split',
  title: 'A share for the kitchen',
  setting: 'Restaurant',
  summary:
    'The line cook wants into the tip pool. Every point that goes to the kitchen comes out of someone else’s week.',
  people: '3 coworkers',
  recurring: true,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Lena', group: 'Server' },
    { id: 'wageA', label: 'Hourly wage', kind: 'money', value: 16, min: 2, max: 60, step: 0.05, group: 'Server' },
    { id: 'hoursA', label: 'Weekly hours', kind: 'number', value: 28, min: 1, max: 60, step: 1, group: 'Server' },
    { id: 'nameB', label: 'Name', kind: 'text', value: 'Marcus', group: 'Line cook' },
    { id: 'wageB', label: 'Hourly wage', kind: 'money', value: 19.5, min: 2, max: 60, step: 0.05, group: 'Line cook' },
    { id: 'hoursB', label: 'Weekly hours', kind: 'number', value: 38, min: 1, max: 60, step: 1, group: 'Line cook' },
    { id: 'nameC', label: 'Name', kind: 'text', value: 'Tasha', group: 'Host and busser' },
    { id: 'wageC', label: 'Hourly wage', kind: 'money', value: 16, min: 2, max: 60, step: 0.05, group: 'Host and busser' },
    { id: 'hoursC', label: 'Weekly hours', kind: 'number', value: 24, min: 1, max: 60, step: 1, group: 'Host and busser' },
    { id: 'pool', label: 'Tips in the pool each week', kind: 'money', value: 900, min: 50, max: 10000, step: 10, group: 'Tip pool' },
  ],
  build(facts): Scenario {
    const names = {
      a: text(facts, 'nameA', 'Lena'),
      b: text(facts, 'nameB', 'Marcus'),
      c: text(facts, 'nameC', 'Tasha'),
    };
    const wage = { a: num(facts, 'wageA'), b: num(facts, 'wageB'), c: num(facts, 'wageC') };
    const hours = { a: num(facts, 'hoursA'), b: num(facts, 'hoursB'), c: num(facts, 'hoursC') };
    const pool = num(facts, 'pool');

    const shares = (c: Record<string, string>) => {
      const kitchen = Number(c.kitchen) / 100;
      const floor = Number(c.floor) / 100;
      return { a: 1 - kitchen - floor, b: kitchen, c: floor };
    };

    const evaluate: Scenario['evaluate'] = (c) => {
      const share = shares(c);
      const result: ReturnType<Scenario['evaluate']> = {};
      for (const id of ['a', 'b', 'c'] as const) {
        const tips = pool * share[id];
        result[id] = workerOutcome(wage[id] * hours[id] + tips, hours[id], {
          extra: { weeklyTips: Math.round(tips * 100) / 100 },
        });
      }
      return result;
    };

    const base = (id: 'a' | 'b' | 'c') => wage[id] * hours[id];
    const shared = {
      kind: 'worker' as const,
      metrics: [metrics.pay(), metrics.tips(), metrics.rate(), metrics.hours()],
      priorities: payOnly,
    };

    const parties: Party[] = [
      {
        ...shared,
        id: 'a',
        name: names.a,
        role: 'Server',
        publicBrief: 'Keeps 90% of the pool today. Says tips are payment for table service.',
        privateBrief:
          'Your hourly wage is the lowest in the building and tips are most of your income. You accept that the kitchen deserves something, but if your share drops below about 70% of the pool you can’t cover your bills.',
        limits: [
          payFloor(floorTo(base('a') + pool * 0.7, 5), base('a') + pool * 0.9),
          rateFloor(null, wage.a + (pool * 0.9) / hours.a, { label: 'Lowest effective hourly I can accept' }),
        ],
      },
      {
        ...shared,
        id: 'b',
        name: names.b,
        role: 'Line cook',
        publicBrief: 'Gets no share of tips today. Says the food is what guests are tipping for.',
        privateBrief:
          'You work the longest hours and see none of the tips. You’re not asking for half, but anything under 10% of the pool would feel like a brush-off.',
        limits: [
          payFloor(floorTo(base('b') + pool * 0.1, 5), base('b') + pool * 0.15),
          rateFloor(null, wage.b, { label: 'Lowest effective hourly I can accept' }),
        ],
      },
      {
        ...shared,
        id: 'c',
        name: names.c,
        role: 'Host and busser',
        publicBrief: 'Gets 10% of the pool today. Seats and clears every table and thinks that share is low.',
        privateBrief:
          'You seat, clear and reset every table. You want at least 15% of the pool, and you won’t accept a deal that pays for the kitchen’s share out of yours.',
        limits: [
          payFloor(floorTo(base('c') + pool * 0.15, 5), base('c') + pool * 0.15),
          rateFloor(null, wage.c, { label: 'Lowest effective hourly I can accept' }),
        ],
      },
    ];

    const percent = (n: number) => ({ id: String(n), label: n === 0 ? 'None' : `${n}%` });

    return {
      id: 'kitchen-share',
      category: 'tip-split',
      title: 'A share for the kitchen',
      setting: 'Restaurant',
      summary: kitchenShare.summary,
      recurring: true,
      caution:
        'Tip-pooling rules differ by state and country, including who is allowed to share in a pool. Check the rules where you work before changing a real one.',
      story: [
        `On the shifts these three work together, the tip pool comes to about ${money(pool)} a week. Today ${names.c} gets 10% for hosting and bussing, ${names.a} keeps the rest, and the kitchen gets nothing.`,
        `${names.b} has asked the owner to cut the kitchen in. The owner’s answer: agree on a split among yourselves and it will go on the next schedule.`,
        'Hours and hourly wages stay as they are. Only the split of the pool is on the table.',
      ],
      parties,
      slots: [],
      issues: [
        { id: 'kitchen', label: 'Kitchen share of the pool', options: KITCHEN.map(percent) },
        { id: 'floor', label: 'Host and busser share of the pool', options: FLOOR.map(percent) },
      ],
      baseline: { kitchen: '0', floor: '10' },
      evaluate,
      derivedTerms: (c) => [`${names.a} keeps ${Math.round(shares(c).a * 100)}% of the pool`],
    };
  },
};
