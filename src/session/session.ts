import {
  feasibleFor,
  nearestMiss,
  partyOf,
  pickProposals,
  rank,
  relaxTo,
  suggestedLimits,
  tightenPast,
} from '../engine/engine';
import { createRng } from '../engine/rng';
import {
  simulatedConcession,
  simulatedReplies,
  simulatedSetup,
  type Reply,
} from '../engine/simulate';
import type { LimitValues, NumericLimitSpec, PartyId, Ranked, Scenario } from '../engine/types';

/**
 * One negotiation from first private limit to agreement or walk-away, as a
 * pure state machine. The screen only ever shows one person their own limits;
 * this module is the only place that sees everyone's at once.
 */

export type Mode = 'together' | 'solo';
export type { Reply };

export interface Proposal extends Ranked {
  letter: string;
  /** Offered before, declined, and back after limits were revisited. */
  returning: boolean;
  /** The most balanced of everything that currently fits everyone. */
  top: boolean;
}

export type Result =
  | { kind: 'agreement'; matches: string[]; chosen: string | null }
  | { kind: 'no-match'; moreOptions: boolean }
  | { kind: 'no-overlap' }
  | { kind: 'exhausted' }
  | { kind: 'ended' };

/** A private hint: one of your own limits is what the closest arrangement misses. */
export interface Nudge {
  limitId: string;
  actual: number;
  gap: number;
  /** The limit value that would let the closest arrangement through. */
  relaxedValue: number;
}

export interface Revision {
  /** Why limits are being revisited. */
  reason: 'no-overlap' | 'rethink';
  /** False when every arrangement clashes with someone's availability. */
  nearMissFound: boolean;
  nudges: Record<PartyId, Nudge[]>;
}

export type Tightening = { limitId: string; key: string } | { limitId: string; slot: string };

export interface SessionState {
  /** Random id, used only to group research records from one session. */
  id: string;
  /** Opt-in research mode: answers are recorded for people who agree. */
  research: boolean;
  templateId: string;
  scenario: Scenario;
  customised: boolean;
  mode: Mode;
  /** People entering their own limits and replies, in turn order. */
  humans: PartyId[];
  phase: 'limits' | 'proposals' | 'review' | 'result';
  turn: number;
  limits: Record<PartyId, LimitValues>;
  prefs: Record<PartyId, string>;
  round: number;
  letters: Record<string, string>;
  offered: string[];
  proposals: Proposal[];
  replies: Record<PartyId, Record<string, Reply>>;
  result: Result | null;
  revision: Revision | null;
  /** Solo practice: the simulated side gave ground during the last revision. */
  othersMoved: boolean;
  startedAt: number;
}

export type Action =
  | { type: 'lock-limits'; partyId: PartyId; values: LimitValues; pref: string }
  | { type: 'begin-review' }
  | { type: 'submit-review'; partyId: PartyId; replies: Record<string, Reply>; tighten: Tightening[] }
  | { type: 'next-round' }
  | { type: 'revise-limits' }
  | { type: 'choose'; key: string }
  | { type: 'end' };

export interface StartOptions {
  templateId: string;
  scenario: Scenario;
  mode: Mode;
  /** Required in solo mode: the person the player speaks for. */
  soloRole?: PartyId;
  seed?: number;
  now?: number;
  customised?: boolean;
  research?: boolean;
  id?: string;
}

export function startSession(options: StartOptions): SessionState {
  const { scenario, mode } = options;
  const rng = createRng(options.seed ?? 1);
  const humans =
    mode === 'solo'
      ? [options.soloRole ?? scenario.parties[0].id]
      : scenario.parties.map((p) => p.id);

  const limits: Record<PartyId, LimitValues> = {};
  const prefs: Record<PartyId, string> = {};
  for (const party of scenario.parties) {
    if (humans.includes(party.id)) {
      limits[party.id] = suggestedLimits(party);
      prefs[party.id] = party.priorities[0].id;
    } else {
      const setup = simulatedSetup(party, rng);
      limits[party.id] = setup.limits;
      prefs[party.id] = setup.pref;
    }
  }

  return {
    templateId: options.templateId,
    scenario,
    id: options.id ?? `s-${(options.now ?? Date.now()).toString(36)}-${Math.floor(rng() * 1e9).toString(36)}`,
    research: options.research ?? false,
    customised: options.customised ?? false,
    mode,
    humans,
    phase: 'limits',
    turn: 0,
    limits,
    prefs,
    round: 0,
    letters: {},
    offered: [],
    proposals: [],
    replies: {},
    result: null,
    revision: null,
    othersMoved: false,
    startedAt: options.now ?? Date.now(),
  };
}

export function currentParty(state: SessionState): PartyId | null {
  return state.phase === 'limits' || state.phase === 'review'
    ? (state.humans[state.turn] ?? null)
    : null;
}

function letterFor(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

function nextPicks(state: SessionState): { picks: Ranked[]; ranked: Ranked[] } {
  const feasible = feasibleFor(state.scenario, state.limits);
  const ranked = rank(state.scenario, feasible, state.prefs);
  return { ranked, picks: pickProposals(state.scenario, ranked, new Set(state.offered)) };
}

function propose(state: SessionState): SessionState {
  const base = { ...state, turn: 0, replies: {}, revision: null };
  const { picks, ranked } = nextPicks(state);
  if (ranked.length === 0) {
    return { ...base, phase: 'result', proposals: [], result: { kind: 'no-overlap' } };
  }
  if (picks.length === 0) {
    return { ...base, phase: 'result', proposals: [], result: { kind: 'exhausted' } };
  }

  const letters = { ...state.letters };
  const proposals: Proposal[] = picks.map((pick) => {
    const returning = pick.key in letters;
    if (!returning) letters[pick.key] = letterFor(Object.keys(letters).length);
    return { ...pick, letter: letters[pick.key], returning, top: pick.key === ranked[0].key };
  });

  return {
    ...base,
    phase: 'proposals',
    round: state.round + 1,
    letters,
    offered: [...state.offered, ...proposals.map((p) => p.key)],
    proposals,
    result: null,
  };
}

function resolve(state: SessionState): SessionState {
  const replies = { ...state.replies };
  for (const party of state.scenario.parties) {
    if (!state.humans.includes(party.id)) {
      replies[party.id] = simulatedReplies(party.id, state.proposals, state.round);
    }
  }
  const matches = state.proposals
    .filter((p) => state.scenario.parties.every((party) => replies[party.id]?.[p.key] === 'accept'))
    .map((p) => p.key);

  const resolved = { ...state, replies, phase: 'result' as const, turn: 0 };
  if (matches.length > 0) {
    return {
      ...resolved,
      result: { kind: 'agreement', matches, chosen: matches.length === 1 ? matches[0] : null },
    };
  }
  return {
    ...resolved,
    result: { kind: 'no-match', moreOptions: nextPicks(resolved).picks.length > 0 },
  };
}

function applyTightenings(
  state: SessionState,
  partyId: PartyId,
  tighten: Tightening[],
): LimitValues {
  const party = partyOf(state.scenario, partyId);
  const values = { ...state.limits[partyId] };
  for (const item of tighten) {
    const spec = party.limits.find((l) => l.id === item.limitId);
    if (!spec) continue;
    if (spec.kind === 'unavailable') {
      if (!('slot' in item)) continue;
      const blocked = Array.isArray(values[spec.id]) ? (values[spec.id] as string[]) : [];
      if (!blocked.includes(item.slot)) values[spec.id] = [...blocked, item.slot];
      continue;
    }
    if (!('key' in item)) continue;
    const proposal = state.proposals.find((p) => p.key === item.key);
    const actual = proposal?.outcomes[partyId].metrics[spec.metric];
    if (typeof actual !== 'number') continue;
    const current = typeof values[spec.id] === 'number' ? (values[spec.id] as number) : null;
    values[spec.id] = tightenPast(spec, current, actual);
  }
  return values;
}

function beginRevision(state: SessionState): SessionState {
  const limits = { ...state.limits };
  let revision: Revision = { reason: 'rethink', nearMissFound: false, nudges: {} };
  let othersMoved = false;

  if (state.result?.kind === 'no-overlap') {
    const miss = nearestMiss(state.scenario, limits);
    revision = { reason: 'no-overlap', nearMissFound: miss !== null, nudges: {} };
    if (miss) {
      for (const party of state.scenario.parties) {
        const found = miss.byParty[party.id] ?? [];
        if (!state.humans.includes(party.id)) {
          const conceded = simulatedConcession(party, limits[party.id], found);
          limits[party.id] = conceded.values;
          othersMoved = othersMoved || conceded.moved;
          continue;
        }
        revision.nudges[party.id] = found
          .filter((v) => v.kind !== 'unavailable' && v.actual !== undefined)
          .map((v) => {
            const spec = party.limits.find((l) => l.id === v.limitId) as NumericLimitSpec;
            return {
              limitId: v.limitId,
              actual: v.actual!,
              gap: v.gap ?? 0,
              relaxedValue: relaxTo(spec, v.actual!),
            };
          });
      }
    }
  }

  return {
    ...state,
    phase: 'limits',
    turn: 0,
    limits,
    // Limits are about to change, so earlier proposals may come back.
    offered: [],
    proposals: [],
    replies: {},
    result: null,
    revision,
    othersMoved,
  };
}

export function reduce(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'lock-limits': {
      if (state.phase !== 'limits' || currentParty(state) !== action.partyId) return state;
      const next = {
        ...state,
        limits: { ...state.limits, [action.partyId]: action.values },
        prefs: { ...state.prefs, [action.partyId]: action.pref },
        turn: state.turn + 1,
      };
      return next.turn >= next.humans.length ? propose(next) : next;
    }
    case 'begin-review':
      return state.phase === 'proposals' ? { ...state, phase: 'review', turn: 0 } : state;
    case 'submit-review': {
      if (state.phase !== 'review' || currentParty(state) !== action.partyId) return state;
      const next = {
        ...state,
        replies: { ...state.replies, [action.partyId]: action.replies },
        limits: {
          ...state.limits,
          [action.partyId]: applyTightenings(state, action.partyId, action.tighten),
        },
        turn: state.turn + 1,
      };
      return next.turn >= next.humans.length ? resolve(next) : next;
    }
    case 'next-round':
      return state.result?.kind === 'no-match' ? propose(state) : state;
    case 'revise-limits':
      return state.phase === 'result' && state.result?.kind !== 'agreement'
        ? beginRevision(state)
        : state;
    case 'choose':
      return state.result?.kind === 'agreement' && state.result.matches.includes(action.key)
        ? { ...state, result: { ...state.result, chosen: action.key } }
        : state;
    case 'end':
      return { ...state, phase: 'result', result: { kind: 'ended' } };
  }
}

export function agreedProposal(state: SessionState): Proposal | null {
  if (state.result?.kind !== 'agreement' || !state.result.chosen) return null;
  const chosen = state.result.chosen;
  return state.proposals.find((p) => p.key === chosen) ?? null;
}

export function isOver(state: SessionState): boolean {
  if (!state.result) return false;
  if (state.result.kind === 'ended') return true;
  return state.result.kind === 'agreement' && state.result.chosen !== null;
}
