import { formatValue, round2 } from './format';
import type {
  Candidate,
  Choices,
  LimitValues,
  NumericLimitSpec,
  Outcome,
  Party,
  PartyId,
  Ranked,
  Scenario,
  Violation,
} from './types';

/** Tolerance for comparing money and hours, so $855.00 meets an $855 floor. */
const EPS = 0.005;

const candidateCache = new WeakMap<Scenario, Candidate[]>();

export function keyOf(scenario: Scenario, choices: Choices): string {
  return scenario.issues.map((issue) => choices[issue.id]).join('|');
}

/** Every valid combination of options, with projected outcomes for each person. */
export function allCandidates(scenario: Scenario): Candidate[] {
  const cached = candidateCache.get(scenario);
  if (cached) return cached;

  let combos: Choices[] = [{}];
  for (const issue of scenario.issues) {
    combos = combos.flatMap((partial) =>
      issue.options.map((option) => ({ ...partial, [issue.id]: option.id })),
    );
  }

  const baselineKey = keyOf(scenario, scenario.baseline);
  const candidates = combos
    .filter((choices) => !scenario.isValid || scenario.isValid(choices))
    .map((choices) => {
      const key = keyOf(scenario, choices);
      return {
        key,
        choices,
        outcomes: scenario.evaluate(choices),
        isBaseline: key === baselineKey,
      };
    });

  candidateCache.set(scenario, candidates);
  return candidates;
}

export function baselineOf(scenario: Scenario): Candidate {
  const baseline = allCandidates(scenario).find((c) => c.isBaseline);
  if (!baseline) throw new Error(`Scenario "${scenario.id}" has no valid baseline`);
  return baseline;
}

export function partyOf(scenario: Scenario, partyId: PartyId): Party {
  const party = scenario.parties.find((p) => p.id === partyId);
  if (!party) throw new Error(`Unknown party "${partyId}" in "${scenario.id}"`);
  return party;
}

export function suggestedLimits(party: Party): LimitValues {
  const values: LimitValues = {};
  for (const spec of party.limits) {
    values[spec.id] = spec.kind === 'unavailable' ? [...spec.suggested] : spec.suggested;
  }
  return values;
}

/** Which of this person's limits an outcome breaks. Empty means it respects them all. */
export function violations(party: Party, values: LimitValues, outcome: Outcome): Violation[] {
  const found: Violation[] = [];
  for (const spec of party.limits) {
    const value = values[spec.id];
    if (spec.kind === 'unavailable') {
      const blocked = Array.isArray(value) ? value : [];
      const clash = outcome.shifts.filter((slot) => blocked.includes(slot));
      if (clash.length > 0) found.push({ limitId: spec.id, kind: spec.kind, slots: clash });
      continue;
    }
    if (typeof value !== 'number') continue;
    const actual = outcome.metrics[spec.metric];
    if (typeof actual !== 'number') continue;
    if (spec.kind === 'min' && actual < value - EPS) {
      found.push({ limitId: spec.id, kind: spec.kind, gap: round2(value - actual), actual });
    }
    if (spec.kind === 'max' && actual > value + EPS) {
      found.push({ limitId: spec.id, kind: spec.kind, gap: round2(actual - value), actual });
    }
  }
  return found;
}

export function fitsEveryone(
  scenario: Scenario,
  limits: Record<PartyId, LimitValues>,
  candidate: Candidate,
): boolean {
  return scenario.parties.every(
    (party) =>
      violations(party, limits[party.id] ?? {}, candidate.outcomes[party.id]).length === 0,
  );
}

/**
 * Arrangements that respect every person's limits. The baseline is left out:
 * it is what happens with no agreement, not something to propose.
 */
export function feasibleFor(
  scenario: Scenario,
  limits: Record<PartyId, LimitValues>,
): Candidate[] {
  return allCandidates(scenario).filter(
    (candidate) => !candidate.isBaseline && fitsEveryone(scenario, limits, candidate),
  );
}

/** How many arrangements one person's own limits leave open. Uses nobody else's limits. */
export function countFitting(
  scenario: Scenario,
  partyId: PartyId,
  values: LimitValues,
): { fit: number; total: number } {
  const party = partyOf(scenario, partyId);
  const options = allCandidates(scenario).filter((c) => !c.isBaseline);
  const fit = options.filter(
    (c) => violations(party, values, c.outcomes[partyId]).length === 0,
  ).length;
  return { fit, total: options.length };
}

/**
 * Scores each candidate 0–1 per person, relative to the other candidates in
 * the set: 1 is the best this person could get among them, 0 the worst.
 * A person's chosen priority decides which projected numbers count.
 */
export function utilityTable(
  scenario: Scenario,
  candidates: Candidate[],
  prefs: Record<PartyId, string>,
): Record<string, Record<PartyId, number>> {
  const table: Record<string, Record<PartyId, number>> = {};
  for (const candidate of candidates) table[candidate.key] = {};

  for (const party of scenario.parties) {
    const priority =
      party.priorities.find((p) => p.id === prefs[party.id]) ?? party.priorities[0];
    const weights = Object.entries(priority?.weights ?? {}).filter(([, w]) => w !== 0);
    const totalWeight = weights.reduce((sum, [, w]) => sum + Math.abs(w), 0);

    const ranges = new Map<string, { min: number; max: number }>();
    for (const [metric] of weights) {
      const values = candidates.map((c) => c.outcomes[party.id].metrics[metric] ?? 0);
      ranges.set(metric, { min: Math.min(...values), max: Math.max(...values) });
    }

    for (const candidate of candidates) {
      if (totalWeight === 0) {
        table[candidate.key][party.id] = 0.5;
        continue;
      }
      let score = 0;
      for (const [metric, weight] of weights) {
        const { min, max } = ranges.get(metric)!;
        const value = candidate.outcomes[party.id].metrics[metric] ?? 0;
        const position = max - min < EPS ? 0.5 : (value - min) / (max - min);
        score += Math.abs(weight) * (weight > 0 ? position : 1 - position);
      }
      table[candidate.key][party.id] = score / totalWeight;
    }
  }
  return table;
}

export function distance(a: Choices, b: Choices): number {
  return Object.keys(a).filter((issue) => a[issue] !== b[issue]).length;
}

function compareLeximin(a: number[], b: number[]): number {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i] - y[i]) > 1e-9) return y[i] - x[i];
  }
  return 0;
}

/**
 * Orders candidates so the worst-off person does as well as possible
 * (leximin). Ties go to the higher average, then to the arrangement that
 * changes the least, then to a stable key so results are repeatable.
 */
export function rank(
  scenario: Scenario,
  candidates: Candidate[],
  prefs: Record<PartyId, string>,
): Ranked[] {
  const table = utilityTable(scenario, candidates, prefs);
  const ranked: Ranked[] = candidates.map((c) => ({ ...c, utilities: table[c.key] }));
  const mean = (r: Ranked) => {
    const values = Object.values(r.utilities);
    return values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
  };
  return ranked.sort((a, b) => {
    const byFairness = compareLeximin(Object.values(a.utilities), Object.values(b.utilities));
    if (byFairness !== 0) return byFairness;
    const byMean = mean(b) - mean(a);
    if (Math.abs(byMean) > 1e-9) return byMean;
    const byChange =
      distance(a.choices, scenario.baseline) - distance(b.choices, scenario.baseline);
    if (byChange !== 0) return byChange;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/**
 * Takes the next few proposals from a ranked list, skipping ones already
 * offered and preferring options that differ from each other in more than
 * one respect, so a round offers real alternatives rather than near-copies.
 */
export function pickProposals(
  scenario: Scenario,
  ranked: Ranked[],
  exclude: ReadonlySet<string>,
  count = 3,
): Ranked[] {
  const pool = ranked.filter((r) => !exclude.has(r.key));
  const spread = scenario.issues.length >= 3 ? 2 : 1;
  const picks: Ranked[] = [];
  for (const candidate of pool) {
    if (picks.length >= count) break;
    if (picks.every((p) => distance(p.choices, candidate.choices) >= spread)) {
      picks.push(candidate);
    }
  }
  for (const candidate of pool) {
    if (picks.length >= count) break;
    if (!picks.includes(candidate)) picks.push(candidate);
  }
  return picks.sort((a, b) => pool.indexOf(a) - pool.indexOf(b));
}

export interface NearMiss {
  candidate: Candidate;
  byParty: Record<PartyId, Violation[]>;
}

/**
 * When nothing fits everyone, finds the arrangement that comes closest:
 * no availability clashes, and the smallest total overshoot of numeric
 * limits relative to their size. Returns null when every arrangement
 * clashes with somebody's availability.
 */
export function nearestMiss(
  scenario: Scenario,
  limits: Record<PartyId, LimitValues>,
): NearMiss | null {
  let best: (NearMiss & { score: number }) | null = null;
  for (const candidate of allCandidates(scenario)) {
    if (candidate.isBaseline) continue;
    const byParty: Record<PartyId, Violation[]> = {};
    let score = 0;
    let hardClash = false;
    let anyViolation = false;
    for (const party of scenario.parties) {
      const values = limits[party.id] ?? {};
      const found = violations(party, values, candidate.outcomes[party.id]);
      byParty[party.id] = found;
      for (const violation of found) {
        anyViolation = true;
        if (violation.kind === 'unavailable') {
          hardClash = true;
          continue;
        }
        const spec = party.limits.find((l) => l.id === violation.limitId) as NumericLimitSpec;
        const limit = values[spec.id] as number;
        score += (violation.gap ?? 0) / Math.max(Math.abs(limit), spec.step);
      }
    }
    if (hardClash || !anyViolation) continue;
    if (!best || score < best.score - 1e-9) best = { candidate, byParty, score };
  }
  return best ? { candidate: best.candidate, byParty: best.byParty } : null;
}

/** The loosest step-aligned limit value that would still admit `actual`. */
export function relaxTo(spec: NumericLimitSpec, actual: number): number {
  const steps = actual / spec.step;
  const aligned = spec.kind === 'min' ? Math.floor(steps + 1e-9) : Math.ceil(steps - 1e-9);
  return round2(aligned * spec.step);
}

/**
 * A new limit value that rules out `actual`: the next step above it for a
 * floor, the next step below it for a ceiling. Never loosens an existing limit.
 */
export function tightenPast(
  spec: NumericLimitSpec,
  current: number | null,
  actual: number,
): number {
  const steps = actual / spec.step;
  if (spec.kind === 'min') {
    const next = round2((Math.floor(steps + 1e-9) + 1) * spec.step);
    return current === null ? next : Math.max(current, next);
  }
  const next = round2((Math.ceil(steps - 1e-9) - 1) * spec.step);
  return current === null ? next : Math.min(current, next);
}

export interface TermLine {
  issueId: string;
  label: string;
  option: string;
  /** True when this differs from how things stand today. */
  changed: boolean;
}

/** The public terms of an arrangement, issue by issue. */
export function describeChoices(scenario: Scenario, choices: Choices): TermLine[] {
  return scenario.issues.map((issue) => {
    const option = issue.options.find((o) => o.id === choices[issue.id]);
    return {
      issueId: issue.id,
      label: issue.label,
      option: option?.label ?? choices[issue.id],
      changed: choices[issue.id] !== scenario.baseline[issue.id],
    };
  });
}

export interface Tradeoffs {
  gains: string[];
  costs: string[];
  other: string[];
}

/** What a person gains, gives up, and otherwise sees change, against how things stand. */
export function tradeoffs(
  scenario: Scenario,
  party: Party,
  outcome: Outcome,
  baseline: Outcome,
): Tradeoffs {
  const result: Tradeoffs = { gains: [], costs: [], other: [] };

  for (const metric of party.metrics) {
    const delta = (outcome.metrics[metric.key] ?? 0) - (baseline.metrics[metric.key] ?? 0);
    if (Math.abs(delta) < EPS) continue;
    const line = `${metric.label} ${delta > 0 ? 'up' : 'down'} ${formatValue(metric.unit, Math.abs(delta))}`;
    if (metric.better === 'neutral') result.other.push(line);
    else if ((metric.better === 'higher') === delta > 0) result.gains.push(line);
    else result.costs.push(line);
  }

  const slotLabel = (id: string) => scenario.slots.find((s) => s.id === id)?.label ?? id;
  for (const slot of outcome.shifts) {
    if (!baseline.shifts.includes(slot)) result.other.push(`Adds ${slotLabel(slot)}`);
  }
  for (const slot of baseline.shifts) {
    if (!outcome.shifts.includes(slot)) result.other.push(`Drops ${slotLabel(slot)}`);
  }
  result.other.push(...outcome.notes);
  return result;
}
