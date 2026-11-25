import { baselineOf, describeChoices, partyOf } from '../engine/engine';
import { formatDelta, formatValue, round2 } from '../engine/format';
import type { PartyId, Scenario, Unit } from '../engine/types';
import type { LogStore } from './log';
import type { Reply, SessionState } from './session';

/**
 * Opt-in research recording. Only in sessions started in research mode, and
 * only for people who agree on their own consent screen. Records what a person
 * was shown and how they answered, never their private limits, and replaces
 * every name with "Person 1", "Person 2" and so on.
 */

export const RESEARCH_KEY = 'oxpecker.research.v1';
export const RECORD_VERSION = 1;

export interface Consent {
  agreed: boolean;
  /** Anonymous participant code: one they were given, or a random one. */
  code: string;
}

export interface Figure {
  label: string;
  unit: Unit;
  today: number;
  proposed: number;
  change: number;
}

/** One yes-or-no answer to one proposal. */
export interface DecisionRecord {
  record_version: number;
  session_id: string;
  participant: string;
  answered_at: string;
  scenario_id: string;
  scenario_title: string;
  setting: string;
  category: string;
  customised: boolean;
  mode: 'together' | 'solo';
  people: number;
  /** This person's place in the scenario, e.g. "Person 2". */
  person: string;
  role: string;
  story: string[];
  private_brief: string;
  priority: string;
  round: number;
  proposal: string;
  proposals_in_round: number;
  shown_as_most_balanced: boolean;
  back_on_the_table: boolean;
  terms: string[];
  figures: Figure[];
  shifts_today: string[];
  shifts_proposed: string[];
  notes: string[];
  answer: Reply;
  /** Seconds between this person's answer screen opening and their answers being locked in. */
  seconds_on_screen: number;
}

export function randomCode(random: () => number = Math.random): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'R-';
  for (let i = 0; i < 6; i++) code += letters[Math.floor(random() * letters.length)];
  return code;
}

/** A participant code is kept only if it looks like a code, not a sentence or a name with spaces. */
export function cleanCode(raw: string, random: () => number = Math.random): string {
  const code = raw.trim().slice(0, 24);
  return /^[A-Za-z0-9_-]+$/.test(code) ? code : randomCode(random);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Replaces each person's name with "Person n", matching whole words only. */
export function anonymizer(scenario: Scenario): (text: string) => string {
  const swaps = scenario.parties
    .map((party, index) => ({
      name: party.name.trim(),
      pattern: new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(party.name.trim())}(?![\\p{L}\\p{N}])`, 'gu'),
      label: `Person ${index + 1}`,
    }))
    .filter((swap) => swap.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);
  return (text) => swaps.reduce((out, swap) => out.replace(swap.pattern, swap.label), text);
}

/** Records for every proposal one person answered in the current round. */
export function decisionsFrom(
  state: SessionState,
  partyId: PartyId,
  replies: Record<string, Reply>,
  seconds: number,
  consent: Consent,
  now = Date.now(),
): DecisionRecord[] {
  const { scenario } = state;
  const party = partyOf(scenario, partyId);
  const index = scenario.parties.indexOf(party);
  const anon = anonymizer(scenario);
  const today = baselineOf(scenario).outcomes[partyId];
  const slot = (id: string) => scenario.slots.find((s) => s.id === id)?.label ?? id;
  const priority = party.priorities.find((p) => p.id === state.prefs[partyId])?.label ?? '';

  return state.proposals
    .filter((proposal) => replies[proposal.key])
    .map((proposal) => {
      const outcome = proposal.outcomes[partyId];
      return {
        record_version: RECORD_VERSION,
        session_id: state.id,
        participant: consent.code,
        answered_at: new Date(now).toISOString(),
        scenario_id: scenario.id,
        scenario_title: scenario.title,
        setting: scenario.setting,
        category: scenario.category,
        customised: state.customised,
        mode: state.mode,
        people: scenario.parties.length,
        person: `Person ${index + 1}`,
        role: party.role,
        story: scenario.story.map(anon),
        private_brief: anon(party.privateBrief),
        priority,
        round: state.round,
        proposal: proposal.letter,
        proposals_in_round: state.proposals.length,
        shown_as_most_balanced: proposal.top,
        back_on_the_table: proposal.returning,
        terms: [
          ...describeChoices(scenario, proposal.choices).map((t) => `${t.label}: ${t.option}`),
          ...(scenario.derivedTerms?.(proposal.choices) ?? []),
        ].map(anon),
        figures: party.metrics.map((m) => {
          const before = today.metrics[m.key] ?? 0;
          const after = outcome.metrics[m.key] ?? 0;
          return { label: m.label, unit: m.unit, today: before, proposed: after, change: round2(after - before) };
        }),
        shifts_today: today.shifts.map(slot),
        shifts_proposed: outcome.shifts.map(slot),
        notes: outcome.notes.map(anon),
        answer: replies[proposal.key],
        seconds_on_screen: Math.max(0, Math.round(seconds * 10) / 10),
      };
    });
}

// ---------- Psych-101 style transcripts ----------

const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const shiftList = (shifts: string[]) => (shifts.length ? shifts.join(' · ') : 'none of the shifts in question');

function figureLine(record: DecisionRecord, which: 'today' | 'proposed'): string {
  return record.figures
    .map((f) => {
      const value = formatValue(f.unit, f[which]);
      const change = which === 'proposed' ? formatDelta(f.unit, f.change) : '';
      return `${f.label} ${value}${change ? ` (${change})` : ''}`;
    })
    .join('; ');
}

export interface Transcript {
  text: string;
  experiment: string;
  participant: string;
}

/**
 * One transcript per person per session, in the format of the Psych-101
 * dataset: plain text, with each of the person's own choices inside << >>.
 */
export function toTranscripts(records: DecisionRecord[]): Transcript[] {
  const groups = new Map<string, DecisionRecord[]>();
  for (const record of records) {
    const key = `${record.session_id}/${record.participant}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.entries()].map(([key, rows]) => {
    const first = rows[0];
    const lines = [
      `You are taking part in a workplace negotiation called "${first.scenario_title}" at ${article(first.setting)} ${first.setting.toLowerCase()}. ` +
        `There are ${first.people} people involved. You are ${first.person}, ${article(first.role)} ${first.role.toLowerCase()}.`,
      ...first.story,
      `What only you know: ${first.private_brief}`,
      `How things stand for you today: ${figureLine(first, 'today')}. Your shifts: ${shiftList(first.shifts_today)}.`,
      'In each round you see proposals that fit everyone’s private limits and answer yes or no to each. A proposal becomes the deal only if everyone says yes.',
    ];

    const rounds = [...new Set(rows.map((r) => r.round))].sort((a, b) => a - b);
    for (const round of rounds) {
      const inRound = rows.filter((r) => r.round === round).sort((a, b) => a.proposal.localeCompare(b.proposal));
      lines.push('', `Round ${round}. You said what matters most to you is: ${inRound[0].priority}.`);
      for (const r of inRound) {
        const tags = [r.shown_as_most_balanced ? 'shown as most balanced' : '', r.back_on_the_table ? 'back on the table' : '']
          .filter(Boolean)
          .join(', ');
        lines.push(
          `Proposal ${r.proposal}${tags ? ` (${tags})` : ''}: ${r.terms.join('; ')}. ` +
            `For you: ${figureLine(r, 'proposed')}. Your shifts: ${shiftList(r.shifts_proposed)}.` +
            (r.notes.length ? ` ${r.notes.join('. ')}.` : ''),
        );
      }
      for (const r of inRound) {
        lines.push(`Do you accept Proposal ${r.proposal}? You answer <<${r.answer === 'accept' ? 'yes' : 'no'}>>.`);
      }
    }

    return { text: lines.join('\n'), experiment: `oxpecker/${first.scenario_id}`, participant: key };
  });
}

// ---------- Storage on this device ----------

export function loadResearch(store: LogStore | null): DecisionRecord[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(RESEARCH_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as DecisionRecord[]) : [];
  } catch {
    return [];
  }
}

export function saveResearch(store: LogStore | null, records: DecisionRecord[]): boolean {
  if (!store) return false;
  try {
    store.setItem(RESEARCH_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function clearResearch(store: LogStore | null): void {
  try {
    store?.removeItem(RESEARCH_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export const toJsonLines = (rows: object[]) => rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');

export function researchStats(records: DecisionRecord[]) {
  return {
    decisions: records.length,
    participants: new Set(records.map((r) => r.participant)).size,
    sessions: new Set(records.map((r) => r.session_id)).size,
    accepted: records.filter((r) => r.answer === 'accept').length,
  };
}
