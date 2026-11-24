import { formatValue, round2 } from '../engine/format';
import type {
  AvailabilityLimitSpec,
  Facts,
  MetricSpec,
  NumericLimitSpec,
  Outcome,
  PriorityOption,
  Slot,
} from '../engine/types';

export const num = (facts: Facts, id: string): number => {
  const value = Number(facts[id]);
  return Number.isFinite(value) ? value : 0;
};

export const text = (facts: Facts, id: string, fallback: string): string => {
  const value = String(facts[id] ?? '').trim();
  return value || fallback;
};

/** Rounds down to a step, so a suggested floor never sits above the figure it came from. */
export const floorTo = (n: number, step: number): number =>
  round2(Math.floor(n / step + 1e-9) * step);

export const money = (n: number): string => formatValue('money', n);
export const rate = (n: number): string => formatValue('rate', n);

export interface WorkerOutcomeOptions {
  weekendHours?: number;
  shifts?: string[];
  notes?: string[];
  extra?: Record<string, number>;
}

export function workerOutcome(
  pay: number,
  hours: number,
  options: WorkerOutcomeOptions = {},
): Outcome {
  return {
    metrics: {
      weeklyPay: round2(pay),
      weeklyHours: round2(hours),
      hourlyRate: hours > 0 ? round2(pay / hours) : 0,
      weekendHours: round2(options.weekendHours ?? 0),
      ...options.extra,
    },
    shifts: options.shifts ?? [],
    notes: options.notes ?? [],
  };
}

export const metrics = {
  pay: (label = 'Weekly pay'): MetricSpec => ({
    key: 'weeklyPay',
    label,
    unit: 'money',
    better: 'higher',
  }),
  hours: (label = 'Hours a week'): MetricSpec => ({
    key: 'weeklyHours',
    label,
    unit: 'hours',
    better: 'neutral',
  }),
  rate: (label = 'Effective hourly'): MetricSpec => ({
    key: 'hourlyRate',
    label,
    unit: 'rate',
    better: 'higher',
  }),
  weekend: (label = 'Weekend hours'): MetricSpec => ({
    key: 'weekendHours',
    label,
    unit: 'hours',
    better: 'lower',
  }),
  tips: (label = 'Tips a week'): MetricSpec => ({
    key: 'weeklyTips',
    label,
    unit: 'money',
    better: 'higher',
  }),
};

type NumericOverrides = Partial<Omit<NumericLimitSpec, 'kind' | 'suggested'>>;

export function payFloor(
  suggested: number | null,
  around: number,
  overrides: NumericOverrides = {},
): NumericLimitSpec {
  return {
    id: 'minPay',
    kind: 'min',
    metric: 'weeklyPay',
    label: 'Lowest weekly pay I can accept',
    unit: 'money',
    lo: floorTo(around * 0.5, 5),
    hi: floorTo(around * 1.6, 5) + 5,
    step: 5,
    suggested,
    declineLabel: 'Pay is too low',
    ...overrides,
  };
}

export function rateFloor(
  suggested: number | null,
  around: number,
  overrides: NumericOverrides = {},
): NumericLimitSpec {
  return {
    id: 'minRate',
    kind: 'min',
    metric: 'hourlyRate',
    label: 'Lowest hourly rate I can accept',
    unit: 'rate',
    lo: floorTo(around * 0.7, 0.25),
    hi: floorTo(around * 1.5, 0.25),
    step: 0.25,
    suggested,
    declineLabel: 'Hourly rate is too low',
    ...overrides,
  };
}

export function hoursCeiling(
  suggested: number | null,
  overrides: NumericOverrides = {},
): NumericLimitSpec {
  return {
    id: 'maxHours',
    kind: 'max',
    metric: 'weeklyHours',
    label: 'Most hours I can work in a week',
    unit: 'hours',
    lo: 0,
    hi: 48,
    step: 1,
    suggested,
    declineLabel: 'Too many hours',
    ...overrides,
  };
}

export function weekendCeiling(
  suggested: number | null,
  hi: number,
  overrides: NumericOverrides = {},
): NumericLimitSpec {
  return {
    id: 'maxWeekend',
    kind: 'max',
    metric: 'weekendHours',
    label: 'Most weekend hours I can work',
    unit: 'hours',
    lo: 0,
    hi,
    step: 1,
    suggested,
    declineLabel: 'Too much weekend work',
    ...overrides,
  };
}

export function countLimit(
  spec: Pick<NumericLimitSpec, 'id' | 'kind' | 'metric' | 'label' | 'suggested' | 'declineLabel'> &
    Partial<NumericLimitSpec>,
): NumericLimitSpec {
  return { unit: 'count', lo: 0, hi: 4, step: 1, ...spec };
}

export function unavailable(
  slots: Slot[],
  suggested: string[],
  label = 'Shifts I can’t work',
): AvailabilityLimitSpec {
  return {
    id: 'unavailable',
    kind: 'unavailable',
    label,
    slots: slots.map((s) => s.id),
    suggested,
  };
}

/**
 * The usual three-way choice for an hourly worker: money, the other thing
 * they care about (time off, fewer late nights...), or an even mix.
 */
export function workerPriorities(
  otherLabel: string,
  otherWeights: Record<string, number>,
): PriorityOption[] {
  const total = Object.values(otherWeights).reduce((sum, w) => sum + Math.abs(w), 0) || 1;
  const scaled = Object.fromEntries(
    Object.entries(otherWeights).map(([key, w]) => [key, w / total]),
  );
  return [
    { id: 'pay', label: 'Take-home pay', weights: { weeklyPay: 1 } },
    { id: 'other', label: otherLabel, weights: otherWeights },
    { id: 'both', label: 'Both about equally', weights: { weeklyPay: 1, ...scaled } },
  ];
}

export const payOnly: PriorityOption[] = [
  { id: 'pay', label: 'Take-home pay', weights: { weeklyPay: 1 } },
];
