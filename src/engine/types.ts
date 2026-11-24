/**
 * Domain model.
 *
 * A scenario is a small, fully enumerable negotiation: a handful of issues,
 * each with a few options. Every combination of options is a candidate
 * arrangement, and the scenario knows how to turn a candidate into projected
 * pay, hours and shifts for each person involved.
 */

export type PartyId = string;
export type Unit = 'money' | 'hours' | 'rate' | 'count';
export type Better = 'higher' | 'lower' | 'neutral';
export type Category = 'shift-trade' | 'tip-split' | 'wage';

/** A number the scenario projects for a person, and how to present it. */
export interface MetricSpec {
  key: string;
  label: string;
  unit: Unit;
  /** Whether more of this is good, bad, or a matter of taste for this person. */
  better: Better;
}

/** "What matters most to you" choice. Weights are signed: negative means less is better. */
export interface PriorityOption {
  id: string;
  label: string;
  weights: Record<string, number>;
}

/** A floor or ceiling on one projected number, e.g. "at least $380 a week". */
export interface NumericLimitSpec {
  id: string;
  kind: 'min' | 'max';
  metric: string;
  label: string;
  help?: string;
  unit: Unit;
  lo: number;
  hi: number;
  step: number;
  /** Starting value for practice. `null` means the limit starts switched off. */
  suggested: number | null;
  /** Shown as a one-tap reason when declining, e.g. "Pay is too low". */
  declineLabel: string;
}

/** Shifts a person cannot work at all. */
export interface AvailabilityLimitSpec {
  id: string;
  kind: 'unavailable';
  label: string;
  help?: string;
  slots: string[];
  suggested: string[];
}

export type LimitSpec = NumericLimitSpec | AvailabilityLimitSpec;

/** A number for min/max limits (`null` = no limit), or a list of slot ids. */
export type LimitValue = number | null | string[];
export type LimitValues = Record<string, LimitValue>;

export interface Party {
  id: PartyId;
  name: string;
  role: string;
  kind: 'worker' | 'manager';
  /** What everyone at the table already knows about this person's position. */
  publicBrief: string;
  /** Shown only on this person's private screen. */
  privateBrief: string;
  metrics: MetricSpec[];
  priorities: PriorityOption[];
  limits: LimitSpec[];
}

export interface Slot {
  id: string;
  label: string;
  hours: number;
}

export interface IssueOption {
  id: string;
  label: string;
}

export interface Issue {
  id: string;
  label: string;
  options: IssueOption[];
}

/** One option chosen for every issue. */
export type Choices = Record<string, string>;

export interface Outcome {
  metrics: Record<string, number>;
  /** Slot ids this person would work under the arrangement. */
  shifts: string[];
  /** Plain-language consequences that numbers alone do not show. */
  notes: string[];
}

export interface Scenario {
  id: string;
  category: Category;
  title: string;
  setting: string;
  summary: string;
  story: string[];
  /** Ongoing arrangement (show monthly estimates) or a single week. */
  recurring: boolean;
  caution?: string;
  parties: Party[];
  slots: Slot[];
  issues: Issue[];
  /** The arrangement that stands if nobody agrees to anything. */
  baseline: Choices;
  isValid?: (choices: Choices) => boolean;
  evaluate: (choices: Choices) => Record<PartyId, Outcome>;
  /** Extra public terms that follow from the choices, e.g. the share left over. */
  derivedTerms?: (choices: Choices) => string[];
}

export interface FactSpec {
  id: string;
  label: string;
  kind: 'text' | 'money' | 'number';
  value: string | number;
  min?: number;
  max?: number;
  step?: number;
  group: string;
}

export type Facts = Record<string, string | number>;

/** A scenario whose names, wages and hours can be swapped for real ones. */
export interface ScenarioTemplate {
  id: string;
  category: Category;
  title: string;
  setting: string;
  summary: string;
  people: string;
  recurring: boolean;
  facts: FactSpec[];
  build: (facts: Facts) => Scenario;
}

export interface Candidate {
  key: string;
  choices: Choices;
  outcomes: Record<PartyId, Outcome>;
  isBaseline: boolean;
}

export interface Violation {
  limitId: string;
  kind: LimitSpec['kind'];
  /** How far the projected number is from the limit (numeric limits only). */
  gap?: number;
  /** The projected number itself (numeric limits only). */
  actual?: number;
  /** Clashing slot ids (availability limits only). */
  slots?: string[];
}

export interface Ranked extends Candidate {
  /** 0–1 per person: how well this candidate does for them among the feasible ones. */
  utilities: Record<PartyId, number>;
}
