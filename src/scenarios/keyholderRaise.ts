import { round2 } from '../engine/format';
import type { MetricSpec, Party, PriorityOption, Scenario, ScenarioTemplate } from '../engine/types';
import { countLimit, floorTo, hoursCeiling, metrics, num, payFloor, rate, rateFloor, text } from './helpers';

const RAISES = [0, 0.75, 1.25, 1.75, 2.25];

export const managerMetrics = (coverKey: string, coverLabel: string): MetricSpec[] => [
  { key: 'laborCost', label: 'Weekly cost of the role', unit: 'money', better: 'lower' },
  { key: 'hourlyRate', label: 'Hourly rate paid', unit: 'rate', better: 'lower' },
  { key: 'weeklyHours', label: 'Hours guaranteed', unit: 'hours', better: 'neutral' },
  { key: coverKey, label: coverLabel, unit: 'count', better: 'higher' },
];

export const managerPriorities = (coverKey: string, coverLabel: string): PriorityOption[] => [
  { id: 'cost', label: 'Keeping costs down', weights: { laborCost: -1 } },
  { id: 'cover', label: coverLabel, weights: { [coverKey]: 1 } },
  { id: 'both', label: 'Both about equally', weights: { laborCost: -1, [coverKey]: 1 } },
];

export const rateOption = (current: number, raise: number) => ({
  id: String(raise),
  label: raise === 0 ? `${rate(current)}, no change` : `${rate(round2(current + raise))}, a ${rate(raise).replace('/hr', '')} raise`,
});

/** An associate doing a keyholder's job at an associate's rate asks for the pay to match. */
export const keyholderRaise: ScenarioTemplate = {
  id: 'keyholder-raise',
  category: 'wage',
  title: 'Keys without the pay',
  setting: 'Hardware store',
  summary:
    'Three months of opening and closing the store at an associate’s rate. Time to ask for the pay that goes with the keys.',
  people: 'Worker and manager',
  recurring: true,
  facts: [
    { id: 'nameA', label: 'Name', kind: 'text', value: 'Dana', group: 'Associate' },
    { id: 'rate', label: 'Current hourly rate', kind: 'money', value: 16.75, min: 7, max: 60, step: 0.05, group: 'Associate' },
    { id: 'hours', label: 'Guaranteed weekly hours', kind: 'number', value: 24, min: 4, max: 40, step: 1, group: 'Associate' },
    { id: 'closes', label: 'Keyholder closes a week', kind: 'number', value: 3, min: 1, max: 6, step: 1, group: 'Associate' },
    { id: 'nameM', label: 'Name', kind: 'text', value: 'Ravi', group: 'Manager' },
  ],
  build(facts): Scenario {
    const A = text(facts, 'nameA', 'Dana');
    const M = text(facts, 'nameM', 'Ravi');
    const current = num(facts, 'rate');
    const hours = num(facts, 'hours');
    const closes = Math.max(1, Math.round(num(facts, 'closes')));
    const hourOptions = [hours, hours + 4, hours + 8];
    const closeOptions = [closes - 1, closes, closes + 1];

    const evaluate: Scenario['evaluate'] = (c) => {
      const hourly = round2(current + Number(c.rate));
      const weeklyHours = Number(c.hours);
      const lateCloses = Number(c.closes);
      const pay = round2(hourly * weeklyHours);
      return {
        a: {
          metrics: { weeklyPay: pay, hourlyRate: hourly, weeklyHours, lateCloses },
          shifts: [],
          notes: Number(c.rate) > 0 ? ['Keyholder duties written into the role'] : [],
        },
        m: {
          metrics: { laborCost: pay, hourlyRate: hourly, weeklyHours, closesCovered: lateCloses },
          shifts: [],
          notes: [],
        },
      };
    };

    const parties: Party[] = [
      {
        id: 'a',
        name: A,
        role: 'Sales associate, acting keyholder',
        kind: 'worker',
        publicBrief:
          'Has opened and closed the store with the keys for three months at an associate’s rate. Wants the pay to match the job.',
        privateBrief: `You’ve carried keyholder duties since the last keyholder quit, with no change in pay. A shop down the road pays keyholders ${rate(round2(current + 1.25))}. You want at least that, you’d welcome more guaranteed hours, and ${closes} closes a week is already your limit.`,
        metrics: [
          metrics.pay(),
          metrics.rate('Hourly rate'),
          metrics.hours('Hours guaranteed'),
          { key: 'lateCloses', label: 'Keyholder closes a week', unit: 'count', better: 'lower' },
        ],
        priorities: [
          { id: 'pay', label: 'Take-home pay', weights: { weeklyPay: 1 } },
          { id: 'rate', label: 'A higher hourly rate', weights: { hourlyRate: 1 } },
          { id: 'other', label: 'Fewer late closes', weights: { lateCloses: -1 } },
          { id: 'both', label: 'All about equally', weights: { weeklyPay: 1, hourlyRate: 1, lateCloses: -1 } },
        ],
        limits: [
          rateFloor(round2(current + 1.25), current, { lo: current, hi: round2(current + 3) }),
          payFloor(floorTo((current + 1.25) * hours - 0.01, 5), current * hours),
          hoursCeiling(hours + 8),
          countLimit({
            id: 'maxCloses',
            kind: 'max',
            metric: 'lateCloses',
            label: 'Most closes I can do in a week',
            hi: closes + 2,
            suggested: closes,
            declineLabel: 'Too many closes',
          }),
        ],
      },
      {
        id: 'm',
        name: M,
        role: 'Store manager',
        kind: 'manager',
        publicBrief:
          'Needs the closes covered and wants to keep a reliable keyholder. Has a labor budget and a pay band to work within.',
        privateBrief: `You can’t afford to lose your keyholder, and you need at least ${closes} closes a week covered. But district sets the pay band for this role and your weekly labor budget has little slack. A bigger raise or more hours is possible. Probably not both.`,
        metrics: managerMetrics('closesCovered', 'Closes covered a week'),
        priorities: managerPriorities('closesCovered', 'Getting closes covered'),
        limits: [
          {
            id: 'maxCost',
            kind: 'max',
            metric: 'laborCost',
            label: 'Most I can spend on this role in a week',
            unit: 'money',
            lo: floorTo(current * hours * 0.8, 5),
            hi: floorTo((current + 2.25) * (hours + 8), 5) + 5,
            step: 5,
            suggested: floorTo((current + 1.75) * (hours + 4) * 1.045, 5),
            declineLabel: 'Costs too much',
          },
          {
            id: 'maxRate',
            kind: 'max',
            metric: 'hourlyRate',
            label: 'Highest hourly rate the pay band allows',
            unit: 'rate',
            lo: current,
            hi: round2(current + 3),
            step: 0.25,
            suggested: round2(current + 1.75),
            declineLabel: 'Rate is above the pay band',
          },
          countLimit({
            id: 'minCloses',
            kind: 'min',
            metric: 'closesCovered',
            label: 'Fewest closes I need covered in a week',
            hi: closes + 2,
            suggested: closes,
            declineLabel: 'Not enough closes covered',
          }),
        ],
      },
    ];

    return {
      id: 'keyholder-raise',
      category: 'wage',
      title: 'Keys without the pay',
      setting: 'Hardware store',
      summary: keyholderRaise.summary,
      recurring: true,
      story: [
        `When the store’s keyholder quit three months ago, ${A} started opening and closing, counting the till and setting the alarm. The pay stayed at ${rate(current)}, the associate rate.`,
        `${A} has asked ${M}, the store manager, for a raise that reflects the job. ${M} wants to keep ${A} and needs the closes covered, but answers to a district labor budget.`,
        'Three things can move: the hourly rate, the number of guaranteed hours, and how many closes come with the role.',
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
          id: 'closes',
          label: 'Keyholder closes a week',
          options: closeOptions.map((n) => ({ id: String(n), label: n === 1 ? '1 close' : `${n} closes` })),
        },
      ],
      baseline: { rate: '0', hours: String(hours), closes: String(closes) },
      evaluate,
    };
  },
};
