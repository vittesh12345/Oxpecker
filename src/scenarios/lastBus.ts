import type { Party, Scenario, ScenarioTemplate, Slot } from '../engine/types';
import {
  countLimit,
  floorTo,
  hoursCeiling,
  metrics,
  money,
  num,
  payFloor,
  text,
  unavailable,
  workerOutcome,
  workerPriorities,
} from './helpers';

/** A standing weekend arrangement: late closes with a night differential, and a bus that no longer runs. */
export const lastBus: ScenarioTemplate = {
  id: 'last-bus',
  category: 'shift-trade',
  title: 'The last bus home',
  setting: 'Grocery store',
  summary:
    'Three weekend closes carry a night differential. One clerk needs out of them, the other can only take so many.',
  people: '2 coworkers',
  recurring: true,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Alex', group: 'Closes now' },
    { id: 'wageA', label: 'Hourly wage', kind: 'money', value: 17.8, min: 7, max: 60, step: 0.05, group: 'Closes now' },
    { id: 'otherA', label: 'Other weekly hours', kind: 'number', value: 8, min: 0, max: 30, step: 1, group: 'Closes now' },
    { id: 'nameB', label: 'Name', kind: 'text', value: 'Rosa', group: 'Opens now' },
    { id: 'wageB', label: 'Hourly wage', kind: 'money', value: 16.9, min: 7, max: 60, step: 0.05, group: 'Opens now' },
    { id: 'otherB', label: 'Other weekly hours', kind: 'number', value: 8, min: 0, max: 30, step: 1, group: 'Opens now' },
    { id: 'shiftHours', label: 'Length of each shift, hours', kind: 'number', value: 8, min: 4, max: 12, step: 1, group: 'Shifts' },
    { id: 'nightDiff', label: 'Friday and Saturday close differential per hour', kind: 'money', value: 1.5, min: 0, max: 10, step: 0.25, group: 'Shifts' },
    { id: 'sunDiff', label: 'Sunday close differential per hour', kind: 'money', value: 2.5, min: 0, max: 10, step: 0.25, group: 'Shifts' },
  ],
  build(facts): Scenario {
    const A = text(facts, 'nameA', 'Alex');
    const B = text(facts, 'nameB', 'Rosa');
    const wage = { a: num(facts, 'wageA'), b: num(facts, 'wageB') };
    const other = { a: num(facts, 'otherA'), b: num(facts, 'otherB') };
    const length = num(facts, 'shiftHours');
    const nightDiff = num(facts, 'nightDiff');
    const sunDiff = num(facts, 'sunDiff');

    const slots: Slot[] = [
      { id: 'thu-mid', label: 'Thursday mid-shift', hours: length },
      { id: 'fri-close', label: 'Friday close', hours: length },
      { id: 'sat-open', label: 'Saturday open', hours: length },
      { id: 'sat-close', label: 'Saturday close', hours: length },
      { id: 'sun-open', label: 'Sunday open', hours: length },
      { id: 'sun-close', label: 'Sunday close', hours: length },
    ];

    const evaluate: Scenario['evaluate'] = (c) => {
      const result: ReturnType<Scenario['evaluate']> = {};
      for (const id of ['a', 'b'] as const) {
        const shifts: string[] = [];
        if (c.thu === id) shifts.push('thu-mid');
        if (c.fri === id) shifts.push('fri-close');
        shifts.push(c.sat === id ? 'sat-close' : 'sat-open');
        shifts.push(c.sun === id ? 'sun-close' : 'sun-open');
        const hours = other[id] + shifts.length * length;
        const differential =
          length *
          ((c.fri === id ? nightDiff : 0) +
            (c.sat === id ? nightDiff : 0) +
            (c.sun === id ? sunDiff : 0));
        const lateCloses = shifts.filter((s) => s.endsWith('-close')).length;
        result[id] = workerOutcome(hours * wage[id] + differential, hours, {
          weekendHours: shifts.filter((s) => s !== 'thu-mid').length * length,
          shifts,
          extra: { lateCloses },
        });
      }
      return result;
    };

    const baseline = { fri: 'a', sat: 'a', sun: 'a', thu: 'b' };
    const now = evaluate(baseline);
    const closes = {
      key: 'lateCloses',
      label: 'Late closes a week',
      unit: 'count' as const,
      better: 'lower' as const,
    };
    const shared = {
      kind: 'worker' as const,
      role: 'Grocery clerk',
      metrics: [metrics.pay(), metrics.hours(), closes, metrics.rate()],
      priorities: workerPriorities('Fewer late nights', { lateCloses: -1 }),
    };
    const maxCloses = (suggested: number) =>
      countLimit({
        id: 'maxCloses',
        kind: 'max',
        metric: 'lateCloses',
        label: 'Most late closes I can do in a week',
        hi: 3,
        suggested,
        declineLabel: 'Too many late closes',
      });

    const parties: Party[] = [
      {
        ...shared,
        id: 'a',
        name: A,
        publicBrief:
          'Closes Friday, Saturday and Sunday. Since the route change, the last bus leaves before closing time.',
        privateBrief:
          'You’ve been paying for a ride home three nights a week. You want out of the late closes, though one a week is manageable. The night differential is real money, so your pay can’t fall too far.',
        limits: [
          maxCloses(1),
          payFloor(floorTo(now.a.metrics.weeklyPay * 0.925, 5), now.a.metrics.weeklyPay),
          unavailable(slots, []),
        ],
      },
      {
        ...shared,
        id: 'b',
        name: B,
        publicBrief: 'Opens Saturday and Sunday. Has said the night differential would be welcome.',
        privateBrief:
          'The differential would help, and you can take on late closes, but two a week is your ceiling: your partner works nights and childcare runs out. You won’t take a pay cut to do a favor, and 36 hours is the most you can manage.',
        limits: [
          maxCloses(2),
          payFloor(floorTo(now.b.metrics.weeklyPay, 5), now.b.metrics.weeklyPay),
          hoursCeiling(36),
          unavailable(slots, []),
        ],
      },
    ];

    const closeOrOpen = [
      { id: 'a', label: `${A} closes, ${B} opens` },
      { id: 'b', label: `${B} closes, ${A} opens` },
    ];

    return {
      id: 'last-bus',
      category: 'shift-trade',
      title: 'The last bus home',
      setting: 'Grocery store',
      summary: lastBus.summary,
      recurring: true,
      story: [
        `${A} has closed the store on Friday, Saturday and Sunday for over a year. A bus route change means the last bus now leaves before the close ends.`,
        `${B} opens on Saturday and Sunday and works a Thursday mid-shift. Closes pay a night differential: ${money(nightDiff)} an hour on Friday and Saturday, ${money(sunDiff)} on Sunday.`,
        'On Saturday and Sunday the two of them cover open and close between them, so giving up a close means taking the open. Friday close and the Thursday mid-shift can each go to either person.',
      ],
      parties,
      slots,
      issues: [
        {
          id: 'fri',
          label: 'Friday close',
          options: [
            { id: 'a', label: `${A} closes` },
            { id: 'b', label: `${B} closes` },
          ],
        },
        { id: 'sat', label: 'Saturday', options: closeOrOpen },
        { id: 'sun', label: 'Sunday', options: closeOrOpen },
        {
          id: 'thu',
          label: 'Thursday mid-shift',
          options: [
            { id: 'b', label: `${B} works it` },
            { id: 'a', label: `${A} takes it` },
          ],
        },
      ],
      baseline,
      evaluate,
    };
  },
};
