import type { Party, Scenario, ScenarioTemplate, Slot } from '../engine/types';
import {
  floorTo,
  hoursCeiling,
  metrics,
  num,
  payFloor,
  text,
  unavailable,
  workerOutcome,
  workerPriorities,
} from './helpers';

/** A one-off swap: one barista needs Saturday evening off, the other wants hours. */
export const saturdaySwap: ScenarioTemplate = {
  id: 'saturday-swap',
  category: 'shift-trade',
  title: 'The Saturday swap',
  setting: 'Coffee shop',
  summary:
    'One barista needs Saturday evening off. The other wants more hours, but not at any price.',
  people: '2 coworkers',
  recurring: false,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Maya', group: 'Needs Saturday off' },
    { id: 'wageA', label: 'Hourly wage', kind: 'money', value: 16.5, min: 7, max: 60, step: 0.05, group: 'Needs Saturday off' },
    { id: 'otherA', label: 'Other hours this week', kind: 'number', value: 14, min: 0, max: 40, step: 1, group: 'Needs Saturday off' },
    { id: 'nameB', label: 'Name', kind: 'text', value: 'Jordan', group: 'Could cover' },
    { id: 'wageB', label: 'Hourly wage', kind: 'money', value: 17.25, min: 7, max: 60, step: 0.05, group: 'Could cover' },
    { id: 'otherB', label: 'Other hours this week', kind: 'number', value: 13, min: 0, max: 40, step: 1, group: 'Could cover' },
    { id: 'satHours', label: 'Saturday close, hours', kind: 'number', value: 8, min: 2, max: 12, step: 1, group: 'Shifts' },
    { id: 'sunHours', label: 'Sunday open, hours', kind: 'number', value: 6, min: 2, max: 12, step: 1, group: 'Shifts' },
    { id: 'wedHours', label: 'Wednesday evening, hours', kind: 'number', value: 5, min: 2, max: 12, step: 1, group: 'Shifts' },
  ],
  build(facts): Scenario {
    const A = text(facts, 'nameA', 'Maya');
    const B = text(facts, 'nameB', 'Jordan');
    const wage = { a: num(facts, 'wageA'), b: num(facts, 'wageB') };
    const other = { a: num(facts, 'otherA'), b: num(facts, 'otherB') };
    const sat = num(facts, 'satHours');
    const sun = num(facts, 'sunHours');
    const wed = num(facts, 'wedHours');

    const slots: Slot[] = [
      { id: 'sat-early', label: 'Saturday close, first half', hours: sat / 2 },
      { id: 'sat-late', label: 'Saturday close, second half', hours: sat / 2 },
      { id: 'sun-open', label: 'Sunday open', hours: sun },
      { id: 'wed-eve', label: 'Wednesday evening', hours: wed },
    ];

    const evaluate: Scenario['evaluate'] = (c) => {
      const result: ReturnType<Scenario['evaluate']> = {};
      for (const id of ['a', 'b'] as const) {
        const shifts: string[] = [];
        if (c.sat === id) shifts.push('sat-early', 'sat-late');
        if (c.sat === 'split') shifts.push(id === 'a' ? 'sat-early' : 'sat-late');
        if (c.sun === id) shifts.push('sun-open');
        if (c.wed === id) shifts.push('wed-eve');
        const worked = shifts.reduce((sum, s) => sum + slots.find((x) => x.id === s)!.hours, 0);
        const weekend = shifts
          .filter((s) => s !== 'wed-eve')
          .reduce((sum, s) => sum + slots.find((x) => x.id === s)!.hours, 0);
        const hours = other[id] + worked;
        result[id] = workerOutcome(hours * wage[id], hours, {
          weekendHours: weekend,
          shifts,
          notes: c.sat === 'split' ? ['Handover halfway through the Saturday close'] : [],
        });
      }
      return result;
    };

    const baseline = { sat: 'a', sun: 'b', wed: 'b' };
    const now = evaluate(baseline);
    const payLabel = 'Lowest pay I can accept this week';
    const shared = {
      kind: 'worker' as const,
      metrics: [
        metrics.pay('Pay this week'),
        metrics.hours('Hours this week'),
        metrics.weekend(),
      ],
      priorities: workerPriorities('Time off', { weekendHours: -1, weeklyHours: -0.5 }),
    };

    const parties: Party[] = [
      {
        ...shared,
        id: 'a',
        name: A,
        role: 'Barista, part-time',
        publicBrief: 'Scheduled to close on Saturday. Has asked for the evening off for a family event.',
        privateBrief:
          'Your sister’s graduation dinner is on Saturday evening, so the second half of the close is out. You can give up some hours this week, but rent is due and your pay can’t drop too far. School also caps how many extra hours you can pick up.',
        limits: [
          unavailable(slots, ['sat-late']),
          payFloor(floorTo(now.a.metrics.weeklyPay * 0.8, 5), now.a.metrics.weeklyPay, { label: payLabel }),
          hoursCeiling(now.a.metrics.weeklyHours + 4, { label: 'Most hours I can work this week' }),
        ],
      },
      {
        ...shared,
        id: 'b',
        name: B,
        role: 'Barista, part-time',
        publicBrief: 'Opens on Sunday. Has been asking the manager for more hours.',
        privateBrief:
          'You want more hours and you’re glad to help, but not for free. You won’t end the week with noticeably less pay than you have now, and much more than 30 hours collides with your other commitments.',
        limits: [
          payFloor(floorTo(now.b.metrics.weeklyPay * 0.955, 5), now.b.metrics.weeklyPay, { label: payLabel }),
          hoursCeiling(now.b.metrics.weeklyHours + 6, { label: 'Most hours I can work this week' }),
          unavailable(slots, []),
        ],
      },
    ];

    return {
      id: 'saturday-swap',
      category: 'shift-trade',
      title: 'The Saturday swap',
      setting: 'Coffee shop',
      summary: saturdaySwap.summary,
      recurring: false,
      story: [
        `${A} is on the schedule to close this Saturday (${sat} hours) and has a family dinner that evening. ${B} opens on Sunday and has been asking for more hours.`,
        'The manager has said the two of them can sort it out between themselves, as long as every shift is covered and the answer is in by Thursday.',
        `A straight handover costs ${A} a day’s pay. A swap for Sunday or for ${B}’s Wednesday evening would win some of it back, at ${B}’s expense.`,
      ],
      parties,
      slots,
      issues: [
        {
          id: 'sat',
          label: 'Saturday close',
          options: [
            { id: 'a', label: `${A} works it` },
            { id: 'b', label: `${B} covers all of it` },
            { id: 'split', label: `Split: ${A} first half, ${B} second half` },
          ],
        },
        {
          id: 'sun',
          label: 'Sunday open',
          options: [
            { id: 'b', label: `${B} works it` },
            { id: 'a', label: `${A} takes it` },
          ],
        },
        {
          id: 'wed',
          label: 'Wednesday evening',
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
