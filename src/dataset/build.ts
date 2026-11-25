import {
  allCandidates,
  baselineOf,
  describeChoices,
  distance,
  feasibleFor,
  fitsEveryone,
  nearestMiss,
  rank,
  relaxTo,
  suggestedLimits,
  violations,
} from '../engine/engine';
import { formatValue, round2 } from '../engine/format';
import { createRng, intBetween, pick, type Rng } from '../engine/rng';
import type {
  Candidate,
  Facts,
  LimitValues,
  MetricSpec,
  Outcome,
  Party,
  PartyId,
  Ranked,
  Scenario,
  ScenarioTemplate,
  Violation,
} from '../engine/types';
import { buildScenario, defaultFacts, templates } from '../scenarios';

/**
 * Turns the scenario library into a dataset. Every figure and every answer is
 * computed by the same engine the app uses, so labels are exact rather than
 * annotated. Generation is seeded: the same code always produces the same files.
 */

export const DATASET_VERSION = '1.0.0';
export const PUZZLES_PER_SCENARIO = 50;
export const TEST_PER_SCENARIO = 10;
const SEED = 20261125;

/** First names used to vary the people in puzzles. Chosen only for variety. */
const NAMES = [
  'Ada', 'Amara', 'Andre', 'Bao', 'Camila', 'Chidi', 'Dara', 'Elif', 'Emeka', 'Farah',
  'Gabe', 'Hana', 'Ines', 'Ivan', 'Jae', 'Joon', 'Kai', 'Keisha', 'Leila', 'Luis',
  'Malia', 'Mateo', 'Mei', 'Nadia', 'Noor', 'Omar', 'Pita', 'Quinn', 'Ravi', 'Rhea',
  'Sade', 'Santi', 'Sora', 'Tariq', 'Tomas', 'Uma', 'Vera', 'Wren', 'Yara', 'Zane',
];

// ---------- Shared shapes ----------

interface MeasureValue {
  key: string;
  label: string;
  unit: string;
  value: number;
  display: string;
}

interface PersonOutcome {
  person_id: string;
  name: string;
  measures: MeasureValue[];
  shifts: string[];
  notes: string[];
}

interface Shortfall {
  person_id: string;
  name: string;
  limit_id: string;
  label: string;
  kind: 'min' | 'max' | 'unavailable';
  /** The projected figure the limit applies to, for minimum and maximum limits. */
  measure: string | null;
  /** How far the figure is from the limit, for minimum and maximum limits. */
  by: number | null;
  by_display: string | null;
  /** Shifts the person said they cannot work, for availability limits. */
  shifts: string[];
}

const slotLabel = (scenario: Scenario, id: string) =>
  scenario.slots.find((s) => s.id === id)?.label ?? id;

/** Shift labels can contain commas, so lists of them use a middle dot. */
const shiftList = (labels: string[]) => labels.join(' · ');

function measuresOf(party: Party, outcome: Outcome): MeasureValue[] {
  return party.metrics.map((m) => {
    const value = outcome.metrics[m.key] ?? 0;
    return { key: m.key, label: m.label, unit: m.unit, value, display: formatValue(m.unit, value) };
  });
}

function outcomesOf(scenario: Scenario, candidate: Candidate): PersonOutcome[] {
  return scenario.parties.map((party) => {
    const outcome = candidate.outcomes[party.id];
    return {
      person_id: party.id,
      name: party.name,
      measures: measuresOf(party, outcome),
      shifts: outcome.shifts.map((s) => slotLabel(scenario, s)),
      notes: outcome.notes,
    };
  });
}

function termsOf(scenario: Scenario, candidate: Candidate) {
  return describeChoices(scenario, candidate.choices).map((line) => ({
    issue_id: line.issueId,
    issue: line.label,
    option_id: candidate.choices[line.issueId],
    option: line.option,
    changed: line.changed,
  }));
}

function shortfallsOf(
  scenario: Scenario,
  limits: Record<PartyId, LimitValues>,
  candidate: Candidate,
): Shortfall[] {
  return scenario.parties.flatMap((party) =>
    violations(party, limits[party.id] ?? {}, candidate.outcomes[party.id]).map((v: Violation) => {
      const spec = party.limits.find((l) => l.id === v.limitId)!;
      const by = v.gap ?? null;
      return {
        person_id: party.id,
        name: party.name,
        limit_id: v.limitId,
        label: spec.label,
        kind: spec.kind,
        measure: spec.kind === 'unavailable' ? null : (metricLabel(party, spec.metric)?.label ?? spec.metric),
        by,
        by_display: by === null || spec.kind === 'unavailable' ? null : formatValue(spec.unit, by),
        shifts: (v.slots ?? []).map((s) => slotLabel(scenario, s)),
      };
    }),
  );
}

const prefsOf = (scenario: Scenario) =>
  Object.fromEntries(scenario.parties.map((p) => [p.id, p.priorities[0].id]));

/** Arrangements that can be proposed (everything but the status quo), numbered from 1. */
function numbered(scenario: Scenario): { options: Candidate[]; number: Map<string, number> } {
  const options = allCandidates(scenario).filter((c) => !c.isBaseline);
  return { options, number: new Map(options.map((c, i) => [c.key, i + 1])) };
}

/**
 * Every arrangement tied for first place: same sorted personal scores, same
 * average and same number of changed terms. The engine breaks any remaining
 * tie by an internal key, which is not something a reader can reproduce.
 */
function mostBalanced(scenario: Scenario, ranked: Ranked[]): Ranked[] {
  if (ranked.length === 0) return [];
  const sig = (r: Ranked) => {
    const scores = Object.values(r.utilities).sort((a, b) => a - b);
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    return { scores, mean, changes: distance(r.choices, scenario.baseline) };
  };
  const top = sig(ranked[0]);
  return ranked.filter((r) => {
    const s = sig(r);
    return (
      s.changes === top.changes &&
      Math.abs(s.mean - top.mean) < 1e-9 &&
      s.scores.every((v, i) => Math.abs(v - top.scores[i]) < 1e-9)
    );
  });
}

// ---------- Scenarios ----------

export function scenarioRow(template: ScenarioTemplate, scenario: Scenario) {
  return {
    scenario_id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    setting: scenario.setting,
    summary: scenario.summary,
    story: scenario.story,
    recurring: scenario.recurring,
    caution: scenario.caution ?? null,
    facts: template.facts.map((f) => ({
      id: f.id,
      label: f.label,
      group: f.group,
      kind: f.kind,
      value: String(f.value),
    })),
    shifts: scenario.slots.map((s) => ({ id: s.id, label: s.label, hours: s.hours })),
    issues: scenario.issues.map((issue) => ({
      id: issue.id,
      label: issue.label,
      options: issue.options.map((o) => ({ id: o.id, label: o.label })),
      status_quo: scenario.baseline[issue.id],
    })),
    people: scenario.parties.map((party) => ({
      id: party.id,
      name: party.name,
      role: party.role,
      kind: party.kind,
      public_brief: party.publicBrief,
      private_brief: party.privateBrief,
      measures: party.metrics.map((m) => ({ key: m.key, label: m.label, unit: m.unit, better: m.better })),
      priorities: party.priorities.map((p) => ({
        id: p.id,
        label: p.label,
        weights: Object.entries(p.weights).map(([measure, weight]) => ({ measure, weight })),
      })),
      limits: party.limits.map((l) =>
        l.kind === 'unavailable'
          ? {
              id: l.id, kind: l.kind, label: l.label, measure: null, unit: null,
              min: null, max: null, step: null, suggested: null,
              shift_options: l.slots, suggested_shifts: l.suggested,
            }
          : {
              id: l.id, kind: l.kind, label: l.label, measure: l.metric, unit: l.unit,
              min: l.lo, max: l.hi, step: l.step, suggested: l.suggested,
              shift_options: [], suggested_shifts: [],
            },
      ),
    })),
    arrangement_count: numbered(scenario).options.length,
  };
}

// ---------- Arrangements ----------

export function arrangementRows(scenario: Scenario) {
  const limits = Object.fromEntries(scenario.parties.map((p) => [p.id, suggestedLimits(p)]));
  const candidates = allCandidates(scenario);
  const fitting = candidates.filter((c) => !c.isBaseline && fitsEveryone(scenario, limits, c));
  const ranked = rank(scenario, fitting, prefsOf(scenario));
  const position = new Map(ranked.map((r, i) => [r.key, i + 1]));
  const { number } = numbered(scenario);

  return candidates.map((c) => ({
    scenario_id: scenario.id,
    arrangement_id: c.key,
    number: number.get(c.key) ?? null,
    is_status_quo: c.isBaseline,
    terms: termsOf(scenario, c),
    extra_terms: scenario.derivedTerms?.(c.choices) ?? [],
    outcomes: outcomesOf(scenario, c),
    fits_suggested_limits: position.has(c.key),
    broken_suggested_limits: shortfallsOf(scenario, limits, c),
    balance_rank: position.get(c.key) ?? null,
  }));
}

// ---------- Puzzles ----------

function variedFacts(template: ScenarioTemplate, rng: Rng): Facts {
  const facts = defaultFacts(template);
  const pool = [...NAMES];
  for (const fact of template.facts) {
    if (fact.kind === 'text') {
      const name = pool.splice(intBetween(rng, 0, pool.length - 1), 1)[0];
      facts[fact.id] = name;
    } else if (fact.kind === 'money') {
      const step = fact.step ?? 0.01;
      const scaled = Number(fact.value) * (0.85 + rng() * 0.3);
      const stepped = round2(Math.round(scaled / step) * step);
      facts[fact.id] = Math.min(fact.max ?? Infinity, Math.max(fact.min ?? 0, stepped));
    }
  }
  return facts;
}

/** Limits around the scenario's suggested ones: some tighter, some looser, some switched off. */
function variedLimits(scenario: Scenario, rng: Rng) {
  const today = baselineOf(scenario).outcomes;
  const limits: Record<PartyId, LimitValues> = {};
  const prefs: Record<PartyId, string> = {};
  for (const party of scenario.parties) {
    const values: LimitValues = {};
    for (const spec of party.limits) {
      if (spec.kind === 'unavailable') {
        const blocked = new Set(spec.suggested.filter(() => rng() > 0.2));
        for (const slot of spec.slots) if (rng() < 0.12) blocked.add(slot);
        values[spec.id] = spec.slots.filter((s) => blocked.has(s));
        continue;
      }
      let value: number | null;
      if (spec.suggested === null) {
        value =
          rng() < 0.7
            ? null
            : relaxTo(spec, today[party.id].metrics[spec.metric] ?? 0) + intBetween(rng, -3, 3) * spec.step;
      } else {
        // Positive steps loosen the limit, negative ones tighten it.
        const loosen = intBetween(rng, -2, 4) * spec.step;
        value = rng() < 0.15 ? null : spec.suggested + (spec.kind === 'min' ? -loosen : loosen);
      }
      values[spec.id] = value === null ? null : round2(Math.min(spec.hi, Math.max(spec.lo, value)));
    }
    limits[party.id] = values;
    prefs[party.id] = pick(rng, party.priorities).id;
  }
  return { limits, prefs };
}

function metricLabel(party: Party, key: string): MetricSpec | undefined {
  return party.metrics.find((m) => m.key === key);
}

function describePriority(party: Party, priorityId: string): string {
  const priority = party.priorities.find((p) => p.id === priorityId)!;
  const parts = Object.entries(priority.weights)
    .filter(([, w]) => w !== 0)
    .map(([key, w]) => {
      const label = metricLabel(party, key)?.label ?? key;
      return `${label} (weight ${Number(Math.abs(w).toFixed(4))}, ${w > 0 ? 'more is better' : 'less is better'})`;
    });
  return `${priority.label}: ${parts.join('; ')}`;
}

function describeLimits(scenario: Scenario, party: Party, values: LimitValues): string[] {
  const lines: string[] = [];
  for (const spec of party.limits) {
    const value = values[spec.id];
    if (spec.kind === 'unavailable') {
      const blocked = Array.isArray(value) ? value : [];
      if (blocked.length) lines.push(`Cannot work: ${shiftList(blocked.map((s) => slotLabel(scenario, s)))}`);
      continue;
    }
    if (typeof value === 'number') {
      const measure = metricLabel(party, spec.metric)?.label ?? spec.metric;
      const word = spec.kind === 'min' ? 'at least' : 'at most';
      lines.push(`${measure} must be ${word} ${formatValue(spec.unit, value)}`);
    }
  }
  return lines;
}

function arrangementBlock(scenario: Scenario, number: number, candidate: Candidate): string {
  const terms = [
    ...describeChoices(scenario, candidate.choices).map((t) => `${t.label}: ${t.option}`),
    ...(scenario.derivedTerms?.(candidate.choices) ?? []),
  ].join(' | ');
  const lines = [`#${number}. ${terms}`];
  for (const party of scenario.parties) {
    const outcome = candidate.outcomes[party.id];
    const figures = measuresOf(party, outcome).map((m) => `${m.label} ${m.display}`);
    if (scenario.slots.length > 0) {
      figures.push(
        `shifts: ${outcome.shifts.length ? shiftList(outcome.shifts.map((s) => slotLabel(scenario, s))) : 'none of these'}`,
      );
    }
    lines.push(`    ${party.name}: ${figures.join('; ')}`);
  }
  return lines.join('\n');
}

const RULES = [
  'An arrangement respects a person’s limits when each figure is on the allowed side of every minimum or maximum they set and it gives them none of the shifts they said they cannot work. A figure exactly on a limit is allowed. Keeping things as they are today is not one of the options.',
  '',
  'Questions:',
  '1. Which arrangements respect every person’s limits? List their numbers.',
  '2. Among those, which is the most balanced? Score each person from 0 to 1 on each measure in their priority, scaled between the lowest and highest value that measure takes across the arrangements from question 1 (flipped where less is better, and 0.5 if it does not vary), then take the weighted average of those scores. The most balanced arrangement is the one whose lowest personal score is highest. On a tie, compare the next-lowest score, then the higher average score, then the arrangement that changes fewer terms from today. List every arrangement still tied.',
  '3. If no arrangement respects every limit, say so instead, and name the closest one: among the arrangements that give nobody a shift they cannot work, the one with the smallest total shortfall, where each shortfall is how far a figure misses a limit divided by that limit (or by 1 when the limit is 0). On a tie, pick the lowest number. Say whose limits it misses and by how much.',
].join('\n');

function promptFor(
  scenario: Scenario,
  limits: Record<PartyId, LimitValues>,
  prefs: Record<PartyId, string>,
  options: Candidate[],
): string {
  const today = describeChoices(scenario, scenario.baseline)
    .map((t) => `${t.label}: ${t.option}`)
    .join(' | ');
  const people = scenario.parties.map((party) => {
    const lines = describeLimits(scenario, party, limits[party.id]);
    return [
      `- ${party.name} (${party.role})`,
      `  Priority: ${describePriority(party, prefs[party.id])}`,
      ...(lines.length ? lines.map((l) => `  ${l}`) : ['  No limits set.']),
    ].join('\n');
  });
  return [
    `Scenario: ${scenario.title} (${scenario.setting})`,
    '',
    ...scenario.story,
    '',
    'Each person’s limits and priority:',
    ...people,
    '',
    `Today’s arrangement (not one of the options): ${today}`,
    '',
    `Possible arrangements, with projected figures for each person (${options.length} in all):`,
    ...options.map((c, i) => arrangementBlock(scenario, i + 1, c)),
    '',
    RULES,
  ].join('\n');
}

function termsLine(scenario: Scenario, candidate: Candidate): string {
  return [
    ...describeChoices(scenario, candidate.choices).map((t) => `${t.label}: ${t.option}`),
    ...(scenario.derivedTerms?.(candidate.choices) ?? []),
  ].join('; ');
}

function shortfallText(s: Shortfall): string {
  if (s.kind === 'unavailable') return `${s.name} cannot work ${shiftList(s.shifts)}`;
  const which = s.kind === 'min' ? 'minimum' : 'maximum';
  return `${s.name}’s ${which} for ${s.measure} by ${s.by_display}`;
}

export function puzzleRows(template: ScenarioTemplate, count = PUZZLES_PER_SCENARIO, testCount = TEST_PER_SCENARIO) {
  const rows = [];
  const base = [...template.id].reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, SEED);
  for (let index = 0; index < count; index++) {
    const rng = createRng(base + index * 7919);
    // The first puzzle of each scenario keeps the practice names and figures.
    const facts = index === 0 ? defaultFacts(template) : variedFacts(template, rng);
    const scenario = buildScenario(template, facts);
    const { limits, prefs } = variedLimits(scenario, rng);
    const { options, number } = numbered(scenario);

    const fitting = feasibleFor(scenario, limits);
    const best = mostBalanced(scenario, rank(scenario, fitting, prefs));
    const miss = fitting.length ? null : nearestMiss(scenario, limits);
    const shortfalls = miss ? shortfallsOf(scenario, limits, miss.candidate) : [];

    const respecting = fitting.map((c) => number.get(c.key)!).sort((a, b) => a - b);
    const balanced = best.map((c) => number.get(c.key)!).sort((a, b) => a - b);
    const closest = miss ? number.get(miss.candidate.key)! : null;

    let answer: string;
    if (respecting.length) {
      const lead = best.find((b) => number.get(b.key) === balanced[0])!;
      answer = [
        `1. Arrangements that respect everyone’s limits: ${respecting.map((n) => `#${n}`).join(', ')}.`,
        balanced.length === 1
          ? `2. Most balanced: #${balanced[0]} (${termsLine(scenario, lead)}).`
          : `2. Most balanced, tied: ${balanced.map((n) => `#${n}`).join(', ')}.`,
        '3. Not needed: at least one arrangement respects every limit.',
      ].join('\n');
    } else if (miss) {
      answer = [
        '1. No arrangement respects everyone’s limits.',
        '2. Not applicable.',
        `3. Closest: #${closest} (${termsLine(scenario, miss.candidate)}). It misses ${shortfalls.map(shortfallText).join('; ')}.`,
      ].join('\n');
    } else {
      answer = [
        '1. No arrangement respects everyone’s limits.',
        '2. Not applicable.',
        '3. Every arrangement gives someone a shift they cannot work, so none is close.',
      ].join('\n');
    }

    rows.push({
      puzzle_id: `${template.id}-${String(index).padStart(3, '0')}`,
      scenario_id: template.id,
      category: template.category,
      split: index >= count - testCount ? 'test' : 'train',
      facts: template.facts.map((f) => ({ id: f.id, value: String(facts[f.id]) })),
      people: scenario.parties.map((party) => ({
        person_id: party.id,
        name: party.name,
        role: party.role,
        priority_id: prefs[party.id],
        priority: describePriority(party, prefs[party.id]),
        limits: party.limits.map((spec) => {
          const value = limits[party.id][spec.id];
          return {
            limit_id: spec.id,
            label: spec.label,
            kind: spec.kind,
            unit: spec.kind === 'unavailable' ? null : spec.unit,
            value: typeof value === 'number' ? value : null,
            shifts: Array.isArray(value) ? value.map((s) => slotLabel(scenario, s)) : [],
          };
        }),
      })),
      arrangement_count: options.length,
      prompt: promptFor(scenario, limits, prefs, options),
      answer,
      respecting,
      most_balanced: balanced,
      closest,
      shortfalls,
    });
  }
  return rows;
}

// ---------- Whole dataset ----------

export type Row = Record<string, unknown>;

export interface Dataset {
  scenarios: Row[];
  arrangements: Row[];
  puzzlesTrain: Row[];
  puzzlesTest: Row[];
}

export function buildDataset(): Dataset {
  const scenarios: Row[] = [];
  const arrangements: Row[] = [];
  const puzzles: Row[] = [];
  for (const template of templates) {
    const scenario = buildScenario(template);
    scenarios.push(scenarioRow(template, scenario));
    arrangements.push(...arrangementRows(scenario));
    puzzles.push(...puzzleRows(template));
  }
  return {
    scenarios,
    arrangements,
    puzzlesTrain: puzzles.filter((p) => p.split === 'train'),
    puzzlesTest: puzzles.filter((p) => p.split === 'test'),
  };
}

export const toJsonl = (rows: Row[]) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';

export const DATA_FILES = {
  scenarios: 'data/scenarios.jsonl',
  arrangements: 'data/arrangements.jsonl',
  puzzlesTrain: 'data/puzzles-train.jsonl',
  puzzlesTest: 'data/puzzles-test.jsonl',
} as const;
