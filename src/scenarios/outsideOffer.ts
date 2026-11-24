import { round2 } from '../engine/format';
import type { Party, Scenario, ScenarioTemplate } from '../engine/types';
import { countLimit, floorTo, hoursCeiling, metrics, num, payFloor, rate, rateFloor, text } from './helpers';
import { managerMetrics, managerPriorities, rateOption } from './keyholderRaise';

const RAISES = [0, 0.6, 1.1, 1.6];

/** A shift lead with a better offer elsewhere, and a manager who can't simply match it. */
export const outsideOffer: ScenarioTemplate = {
  id: 'outside-offer',
  category: 'wage',
  title: 'The outside offer',
  setting: 'Garden center',
  summary:
    'A shift lead has a better offer in writing. The manager can’t match the rate, but hours and weekends are negotiable.',
  people: 'Worker and manager',
  recurring: true,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Imani', group: 'Shift lead' },
    { id: 'rate', label: 'Current hourly rate', kind: 'money', value: 18.4, min: 7, max: 60, step: 0.05, group: 'Shift lead' },
    { id: 'hours', label: 'Guaranteed weekly hours', kind: 'number', value: 30, min: 4, max: 40, step: 1, group: 'Shift lead' },
    { id: 'offerRate', label: 'Outside offer, hourly rate', kind: 'money', value: 20.5, min: 7, max: 60, step: 0.05, group: 'Shift lead' },
    { id: 'offerHours', label: 'Outside offer, weekly hours', kind: 'number', value: 32, min: 4, max: 48, step: 1, group: 'Shift lead' },
    { id: 'nameM', label: 'Name', kind: 'text', value: 'Carla', group: 'Manager' },
  ],
  build(facts): Scenario {
    const A = text(facts, 'nameA', 'Imani');
    const M = text(facts, 'nameM', 'Carla');
    const current = num(facts, 'rate');
    const hours = num(facts, 'hours');
    const offerRate = num(facts, 'offerRate');
    const offerHours = num(facts, 'offerHours');
    const hourOptions = [hours, hours + 4, hours + 8];

    const evaluate: Scenario['evaluate'] = (c) => {
      const hourly = round2(current + Number(c.rate));
      const weeklyHours = Number(c.hours);
      const weekends = Number(c.weekends);
      const pay = round2(hourly * weeklyHours);
      return {
        a: {
          metrics: { weeklyPay: pay, hourlyRate: hourly, weeklyHours, weekendShifts: weekends },
          shifts: [],
          notes: weekends < 4 ? [`${4 - weekends} full weekend${weekends === 3 ? '' : 's'} off each month`] : [],
        },
        m: {
          metrics: { laborCost: pay, hourlyRate: hourly, weeklyHours, weekendCover: weekends },
          shifts: [],
          notes: weekends < 4 ? [`${4 - weekends} weekend shift${weekends === 3 ? '' : 's'} a month to cover another way`] : [],
        },
      };
    };

    const parties: Party[] = [
      {
        id: 'a',
        name: A,
        role: 'Shift lead',
        kind: 'worker',
        publicBrief: 'Has a written offer from another employer. Would rather stay if the terms come close.',
        privateBrief: `The other offer is ${rate(offerRate)} for ${offerHours} guaranteed hours. You like this team and would stay for a little less than that, but not for what you make now, and you’re done working every single weekend.`,
        metrics: [
          metrics.pay(),
          metrics.rate('Hourly rate'),
          metrics.hours('Hours guaranteed'),
          { key: 'weekendShifts', label: 'Weekend shifts a month', unit: 'count', better: 'lower' },
        ],
        priorities: [
          { id: 'pay', label: 'Take-home pay', weights: { weeklyPay: 1 } },
          { id: 'rate', label: 'A higher hourly rate', weights: { hourlyRate: 1 } },
          { id: 'other', label: 'Weekends off', weights: { weekendShifts: -1 } },
          { id: 'both', label: 'All about equally', weights: { weeklyPay: 1, hourlyRate: 1, weekendShifts: -1 } },
        ],
        limits: [
          payFloor(floorTo(offerRate * offerHours * 0.95, 5), current * hours),
          rateFloor(round2(current + 0.6), current, { lo: floorTo(current, 0.25), hi: round2(floorTo(current, 0.25) + 3), step: 0.05 }),
          countLimit({
            id: 'maxWeekends',
            kind: 'max',
            metric: 'weekendShifts',
            label: 'Most weekend shifts I’ll work in a month',
            suggested: 3,
            declineLabel: 'Too many weekends',
          }),
          hoursCeiling(hours + 8),
        ],
      },
      {
        id: 'm',
        name: M,
        role: 'Store manager',
        kind: 'manager',
        publicBrief: 'Wants to keep an experienced shift lead. Can’t simply match the outside rate.',
        privateBrief:
          'Replacing a shift lead would cost you months of training. The pay band tops out below the outside offer, so the difference has to come from hours or weekends. You still need most weekends covered.',
        metrics: managerMetrics('weekendCover', 'Weekend shifts covered a month'),
        priorities: managerPriorities('weekendCover', 'Weekend coverage'),
        limits: [
          {
            id: 'maxCost',
            kind: 'max',
            metric: 'laborCost',
            label: 'Most I can spend on this role in a week',
            unit: 'money',
            lo: floorTo(current * hours * 0.8, 5),
            hi: floorTo((current + 1.6) * (hours + 8), 5) + 5,
            step: 5,
            suggested: floorTo((current + 0.6) * (hours + 8) * 1.005, 5),
            declineLabel: 'Costs too much',
          },
          {
            id: 'maxRate',
            kind: 'max',
            metric: 'hourlyRate',
            label: 'Highest hourly rate the pay band allows',
            unit: 'rate',
            lo: floorTo(current, 0.25),
            hi: round2(floorTo(current, 0.25) + 3),
            step: 0.05,
            suggested: round2(current + 1.1),
            declineLabel: 'Rate is above the pay band',
          },
          countLimit({
            id: 'minWeekends',
            kind: 'min',
            metric: 'weekendCover',
            label: 'Fewest weekend shifts I need covered in a month',
            suggested: 3,
            declineLabel: 'Not enough weekend cover',
          }),
        ],
      },
    ];

    return {
      id: 'outside-offer',
      category: 'wage',
      title: 'The outside offer',
      setting: 'Garden center',
      summary: outsideOffer.summary,
      recurring: true,
      story: [
        `${A} leads shifts at ${rate(current)}, ${hours} hours a week, and works every weekend. A competitor has offered ${rate(offerRate)} for ${offerHours} hours.`,
        `${A} told ${M}, the store manager, before answering. ${M} wants to keep ${A} but works within a pay band and a labor budget set above store level.`,
        'Three things can move: the hourly rate, the number of guaranteed hours, and how many weekend shifts a month come with the job.',
      ],
      parties,
      slots: [],
      issues: [
        { id: 'rate', label: 'Hourly rate', options: RAISES.map((r) => rateOption(current, r)) },
        {
          id: 'hours',
          label: 'Guaranteed weekly hours',
          options: hourOptions.map((h) => ({ id: String(h), label: `${h} hours` })),
        },
        {
          id: 'weekends',
          label: 'Weekend shifts a month',
          options: [
            { id: '4', label: 'Every weekend' },
            { id: '3', label: 'Three a month' },
            { id: '2', label: 'Two a month' },
          ],
        },
      ],
      baseline: { rate: '0', hours: String(hours), weekends: '4' },
      evaluate,
    };
  },
};
