import type { Party, Scenario, ScenarioTemplate, Slot } from '../engine/types';
import {
  floorTo,
  metrics,
  num,
  payFloor,
  text,
  unavailable,
  workerOutcome,
  workerPriorities,
} from './helpers';

type Id = 'a' | 'b';

/** Who gets the shifts where the tips are, and whether those tips are shared. */
export const fridayDinner: ScenarioTemplate = {
  id: 'friday-dinner',
  category: 'tip-split',
  title: 'Friday dinner',
  setting: 'Restaurant',
  summary:
    'The senior server holds both weekend dinners. The newer one works the slow lunches and wants a share of the good nights.',
  people: '2 coworkers',
  recurring: true,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Gloria', group: 'Senior server' },
    { id: 'otherHoursA', label: 'Other weekly hours', kind: 'number', value: 16, min: 0, max: 40, step: 1, group: 'Senior server' },
    { id: 'otherTipsA', label: 'Tips from other shifts', kind: 'money', value: 330, min: 0, max: 3000, step: 5, group: 'Senior server' },
    { id: 'nameB', label: 'Name', kind: 'text', value: 'Theo', group: 'Newer server' },
    { id: 'otherHoursB', label: 'Other weekly hours', kind: 'number', value: 14, min: 0, max: 40, step: 1, group: 'Newer server' },
    { id: 'otherTipsB', label: 'Tips from other shifts', kind: 'money', value: 180, min: 0, max: 3000, step: 5, group: 'Newer server' },
    { id: 'wage', label: 'Server hourly wage', kind: 'money', value: 16, min: 2, max: 60, step: 0.05, group: 'Shifts' },
    { id: 'dinnerHours', label: 'Dinner shift, hours', kind: 'number', value: 6, min: 2, max: 12, step: 0.5, group: 'Shifts' },
    { id: 'lunchHours', label: 'Lunch shift, hours', kind: 'number', value: 5, min: 2, max: 12, step: 0.5, group: 'Shifts' },
    { id: 'friTips', label: 'Friday dinner tips', kind: 'money', value: 210, min: 0, max: 2000, step: 5, group: 'Shifts' },
    { id: 'satTips', label: 'Saturday dinner tips', kind: 'money', value: 240, min: 0, max: 2000, step: 5, group: 'Shifts' },
    { id: 'tueTips', label: 'Tuesday lunch tips', kind: 'money', value: 70, min: 0, max: 2000, step: 5, group: 'Shifts' },
    { id: 'wedTips', label: 'Wednesday lunch tips', kind: 'money', value: 75, min: 0, max: 2000, step: 5, group: 'Shifts' },
  ],
  build(facts): Scenario {
    const names: Record<Id, string> = { a: text(facts, 'nameA', 'Gloria'), b: text(facts, 'nameB', 'Theo') };
    const wage = num(facts, 'wage');
    const dinnerHours = num(facts, 'dinnerHours');
    const lunchHours = num(facts, 'lunchHours');
    const otherHours: Record<Id, number> = { a: num(facts, 'otherHoursA'), b: num(facts, 'otherHoursB') };
    const otherTips: Record<Id, number> = { a: num(facts, 'otherTipsA'), b: num(facts, 'otherTipsB') };

    const slots: Slot[] = [
      { id: 'fri-dinner', label: 'Friday dinner', hours: dinnerHours },
      { id: 'sat-dinner', label: 'Saturday dinner', hours: dinnerHours },
      { id: 'tue-lunch', label: 'Tuesday lunch', hours: lunchHours },
      { id: 'wed-lunch', label: 'Wednesday lunch', hours: lunchHours },
    ];

    /** Each dinner is paired with the lunch its holder's counterpart works instead. */
    const pairs = [
      { issue: 'fri', dinner: 'fri-dinner', lunch: 'tue-lunch', dinnerTips: num(facts, 'friTips'), lunchTips: num(facts, 'tueTips') },
      { issue: 'sat', dinner: 'sat-dinner', lunch: 'wed-lunch', dinnerTips: num(facts, 'satTips'), lunchTips: num(facts, 'wedTips') },
    ];

    const evaluate: Scenario['evaluate'] = (c) => {
      const share = Number(c.share) / 100;
      const result: ReturnType<Scenario['evaluate']> = {};
      for (const id of ['a', 'b'] as Id[]) {
        let hours = otherHours[id];
        let tips = otherTips[id];
        let dinners = 0;
        const shifts: string[] = [];
        const notes: string[] = [];
        for (const pair of pairs) {
          const holder = c[pair.issue];
          if (holder === 'alt') {
            // Over two weeks each person works one dinner and one lunch, so
            // any share of dinner tips passes both ways and cancels out.
            hours += (dinnerHours + lunchHours) / 2;
            tips += (pair.dinnerTips + pair.lunchTips) / 2;
            dinners += 0.5;
            shifts.push(pair.dinner, pair.lunch);
          } else if (holder === id) {
            hours += dinnerHours;
            tips += pair.dinnerTips * (1 - share);
            dinners += 1;
            shifts.push(pair.dinner);
          } else {
            hours += lunchHours;
            tips += pair.lunchTips + pair.dinnerTips * share;
            shifts.push(pair.lunch);
          }
        }
        if (pairs.some((pair) => c[pair.issue] === 'alt')) {
          notes.push('Alternating weeks: figures are the average week');
        }
        result[id] = workerOutcome(wage * hours + tips, hours, {
          shifts,
          notes,
          extra: { weeklyTips: Math.round(tips * 100) / 100, primeDinners: dinners },
        });
      }
      return result;
    };

    const baseline = { fri: 'a', sat: 'a', share: '0' };
    const now = evaluate(baseline);
    const dinners = {
      key: 'primeDinners',
      label: 'Weekend dinners a week',
      unit: 'count' as const,
      better: 'higher' as const,
    };
    const shared = {
      kind: 'worker' as const,
      metrics: [metrics.pay('Average weekly pay'), metrics.tips(), dinners, metrics.hours(), metrics.rate()],
      priorities: workerPriorities('Working the weekend dinners', { primeDinners: 1 }),
    };

    const parties: Party[] = [
      {
        ...shared,
        id: 'a',
        name: names.a,
        role: 'Server, six years',
        publicBrief: 'Has worked Friday and Saturday dinner for years. Says those shifts were earned.',
        privateBrief:
          'The weekend dinners are most of your income and you built up those regulars yourself. You’d give some ground to keep the peace, but you can’t lose more than about a tenth of your pay. Wednesday lunch is impossible: that’s your day with your grandson.',
        limits: [
          payFloor(floorTo(now.a.metrics.weeklyPay * 0.895, 5), now.a.metrics.weeklyPay),
          unavailable(slots, ['wed-lunch']),
        ],
      },
      {
        ...shared,
        id: 'b',
        name: names.b,
        role: 'Server, eight months',
        publicBrief: 'Works the Tuesday and Wednesday lunches. Wants a fair shot at the nights where the tips are.',
        privateBrief:
          'You take home far less than the senior server for nearly the same hours. You need roughly 10% more to make this job work, whether that comes from working dinners or from a share of them.',
        limits: [
          payFloor(floorTo(now.b.metrics.weeklyPay * 1.1, 5), now.b.metrics.weeklyPay),
          unavailable(slots, []),
        ],
      },
    ];

    const dinnerOptions = (lunch: string) => [
      { id: 'a', label: `${names.a} works it, ${names.b} takes ${lunch} lunch` },
      { id: 'b', label: `${names.b} works it, ${names.a} takes ${lunch} lunch` },
      { id: 'alt', label: `Alternate weeks, swapping with ${lunch} lunch` },
    ];

    return {
      id: 'friday-dinner',
      category: 'tip-split',
      title: 'Friday dinner',
      setting: 'Restaurant',
      summary: fridayDinner.summary,
      recurring: true,
      caution:
        'Tip-sharing rules differ by state and country. Check the rules where you work before changing a real arrangement.',
      story: [
        `${names.a} has held the Friday and Saturday dinner shifts for years. ${names.b} works Tuesday and Wednesday lunch, where the tips are far smaller.`,
        'The manager is willing to change who works which shift, rotate them, or keep the schedule and have dinner tips partly shared with whoever worked the matching lunch.',
        'Whoever gives up a dinner takes the matching lunch, so both servers keep four shifts between these days.',
      ],
      parties,
      slots,
      issues: [
        { id: 'fri', label: 'Friday dinner', options: dinnerOptions('Tuesday') },
        { id: 'sat', label: 'Saturday dinner', options: dinnerOptions('Wednesday') },
        {
          id: 'share',
          label: 'Dinner tips passed to the server on the matching lunch',
          options: [
            { id: '0', label: 'None' },
            { id: '10', label: '10%' },
            { id: '20', label: '20%' },
          ],
        },
      ],
      baseline,
      evaluate,
    };
  },
};
