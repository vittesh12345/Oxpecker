import type { Party, Scenario, ScenarioTemplate, Slot } from '../engine/types';
import {
  floorTo,
  hoursCeiling,
  metrics,
  money,
  num,
  payFloor,
  text,
  unavailable,
  weekendCeiling,
  workerOutcome,
  workerPriorities,
} from './helpers';

/** Three associates, three holiday-weekend shifts, and nobody wants two of them. */
export const holidayWeekend: ScenarioTemplate = {
  id: 'holiday-weekend',
  category: 'shift-trade',
  title: 'Holiday weekend cover',
  setting: 'Retail store',
  summary:
    'Three shifts on the busiest weekend of the year. One person was handed two, one got none.',
  people: '3 coworkers',
  recurring: false,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Priya', group: 'Drafted for Saturday close' },
    { id: 'wageA', label: 'Hourly wage', kind: 'money', value: 17, min: 7, max: 60, step: 0.05, group: 'Drafted for Saturday close' },
    { id: 'otherA', label: 'Other hours this week', kind: 'number', value: 20, min: 0, max: 40, step: 1, group: 'Drafted for Saturday close' },
    { id: 'nameB', label: 'Name', kind: 'text', value: 'Dev', group: 'Drafted for two shifts' },
    { id: 'wageB', label: 'Hourly wage', kind: 'money', value: 16.25, min: 7, max: 60, step: 0.05, group: 'Drafted for two shifts' },
    { id: 'otherB', label: 'Other hours this week', kind: 'number', value: 16, min: 0, max: 40, step: 1, group: 'Drafted for two shifts' },
    { id: 'nameC', label: 'Name', kind: 'text', value: 'Sam', group: 'Has the weekend off' },
    { id: 'wageC', label: 'Hourly wage', kind: 'money', value: 18.5, min: 7, max: 60, step: 0.05, group: 'Has the weekend off' },
    { id: 'otherC', label: 'Other hours this week', kind: 'number', value: 24, min: 0, max: 40, step: 1, group: 'Has the weekend off' },
    { id: 'shiftHours', label: 'Length of each weekend shift, hours', kind: 'number', value: 8, min: 4, max: 12, step: 1, group: 'Shifts' },
    { id: 'premium', label: 'Holiday premium per hour', kind: 'money', value: 2, min: 0, max: 20, step: 0.25, group: 'Shifts' },
  ],
  build(facts): Scenario {
    const names = {
      a: text(facts, 'nameA', 'Priya'),
      b: text(facts, 'nameB', 'Dev'),
      c: text(facts, 'nameC', 'Sam'),
    };
    const wage = { a: num(facts, 'wageA'), b: num(facts, 'wageB'), c: num(facts, 'wageC') };
    const other = { a: num(facts, 'otherA'), b: num(facts, 'otherB'), c: num(facts, 'otherC') };
    const length = num(facts, 'shiftHours');
    const premium = num(facts, 'premium');
    const ids = ['a', 'b', 'c'] as const;

    const slots: Slot[] = [
      { id: 'sat-open', label: 'Saturday open', hours: length },
      { id: 'sat-close', label: 'Saturday close', hours: length },
      { id: 'sun-mid', label: 'Sunday mid-shift', hours: length },
    ];

    const evaluate: Scenario['evaluate'] = (c) => {
      const result: ReturnType<Scenario['evaluate']> = {};
      for (const id of ids) {
        const shifts = slots.filter((s) => c[s.id] === id).map((s) => s.id);
        const weekend = shifts.length * length;
        const pay = other[id] * wage[id] + weekend * (wage[id] + premium);
        const notes =
          shifts.length === 0
            ? ['Whole holiday weekend off']
            : shifts.length >= 2
              ? ['Works both days of the holiday weekend']
              : [];
        result[id] = workerOutcome(pay, other[id] + weekend, { weekendHours: weekend, shifts, notes });
      }
      return result;
    };

    const baseline = { 'sat-open': 'b', 'sat-close': 'a', 'sun-mid': 'b' };
    const now = evaluate(baseline);
    const oneShiftPay = (id: 'a' | 'b' | 'c') => other[id] * wage[id] + length * (wage[id] + premium);
    const payLabel = 'Lowest pay I can accept this week';
    const shared = {
      kind: 'worker' as const,
      role: 'Sales associate',
      metrics: [
        metrics.pay('Pay this week'),
        metrics.hours('Hours this week'),
        metrics.weekend('Holiday weekend hours'),
      ],
      priorities: workerPriorities('Time off this weekend', { weekendHours: -1 }),
    };

    const parties: Party[] = [
      {
        ...shared,
        id: 'a',
        name: names.a,
        publicBrief: 'On the draft for Saturday close. Says Saturday night is a problem.',
        privateBrief:
          'You look after your nephew on Saturday nights, so the close is out. You’d happily take a daytime shift instead, even two, because the holiday premium helps. Much past 36 hours and you’re too worn out for Monday.',
        limits: [
          unavailable(slots, ['sat-close']),
          payFloor(floorTo(now.a.metrics.weeklyPay * 0.975, 5), now.a.metrics.weeklyPay, { label: payLabel }),
          hoursCeiling(other.a + 2 * length, { label: 'Most hours I can work this week' }),
        ],
      },
      {
        ...shared,
        id: 'b',
        name: names.b,
        publicBrief: 'Drafted for two of the three holiday shifts. Says that is one too many.',
        privateBrief:
          'You’ve been handed both Saturday open and Sunday, again. One holiday shift is fair; two is not. You can live with the smaller paycheck that comes with working one.',
        limits: [
          weekendCeiling(length, 3 * length, { label: 'Most holiday weekend hours I can work' }),
          payFloor(floorTo(oneShiftPay('b') * 0.985, 5), now.b.metrics.weeklyPay, { label: payLabel }),
          unavailable(slots, []),
        ],
      },
      {
        ...shared,
        id: 'c',
        name: names.c,
        role: 'Senior sales associate',
        publicBrief: 'Has the weekend off on the draft. Worked the last three holiday weekends.',
        privateBrief:
          'You were promised this weekend off after covering the last three. You’ll come in for one shift to keep the peace, but not the Saturday close, and not two.',
        limits: [
          unavailable(slots, ['sat-close']),
          weekendCeiling(length, 3 * length, { label: 'Most holiday weekend hours I can work' }),
          payFloor(floorTo(now.c.metrics.weeklyPay, 5), now.c.metrics.weeklyPay, { label: payLabel }),
        ],
      },
    ];

    const who = [
      { id: 'a', label: names.a },
      { id: 'b', label: names.b },
      { id: 'c', label: names.c },
    ];

    return {
      id: 'holiday-weekend',
      category: 'shift-trade',
      title: 'Holiday weekend cover',
      setting: 'Retail store',
      summary: holidayWeekend.summary,
      recurring: false,
      story: [
        `The draft schedule for the holiday weekend is up. ${names.b} has Saturday open and Sunday, ${names.a} has Saturday close, and ${names.c} has the whole weekend off.`,
        `Each shift is ${length} hours and pays a ${money(premium)} holiday premium on top of the usual rate. Store policy rules out anyone working both Saturday shifts back to back.`,
        'The manager will post whatever the three of them agree on, provided all three shifts are covered.',
      ],
      parties,
      slots,
      issues: slots.map((slot) => ({ id: slot.id, label: slot.label, options: who })),
      baseline,
      isValid: (c) => c['sat-open'] !== c['sat-close'],
      evaluate,
    };
  },
};
