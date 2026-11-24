import type { Category } from '../engine/types';
import { isOver, type SessionState } from './session';

/**
 * Practice log. Records how each session went, never what anyone's private
 * limits were, and lives only in this browser unless someone exports it.
 */

export interface LogEntry {
  id: string;
  at: string;
  scenarioId: string;
  scenarioTitle: string;
  category: Category;
  mode: 'together' | 'solo';
  people: number;
  customised: boolean;
  outcome: 'agreement' | 'no-deal';
  rounds: number;
  minutes: number;
  /** 1 (very unfair) to 5 (very fair); null when skipped. */
  fairness: number | null;
  participant: string;
  notes: string;
}

export type LogStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const LOG_KEY = 'oxpecker.practice-log.v1';

export function browserStore(): LogStore | null {
  try {
    const store = globalThis.localStorage;
    const probe = '__oxpecker_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

export function loadLog(store: LogStore | null): LogEntry[] {
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(LOG_KEY) ?? '[]');
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveLog(store: LogStore | null, entries: LogEntry[]): boolean {
  if (!store) return false;
  try {
    store.setItem(LOG_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

export function clearLog(store: LogStore | null): void {
  try {
    store?.removeItem(LOG_KEY);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

export interface Debrief {
  fairness: number | null;
  participant: string;
  notes: string;
}

/** Builds a log entry from a finished session. Limits and replies are deliberately left out. */
export function entryFrom(state: SessionState, debrief: Debrief, now = Date.now()): LogEntry {
  const agreed = state.result?.kind === 'agreement' && isOver(state);
  return {
    id: `${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
    at: new Date(now).toISOString(),
    scenarioId: state.scenario.id,
    scenarioTitle: state.scenario.title,
    category: state.scenario.category,
    mode: state.mode,
    people: state.scenario.parties.length,
    customised: state.customised,
    outcome: agreed ? 'agreement' : 'no-deal',
    rounds: state.round,
    minutes: Math.max(0, Math.round(((now - state.startedAt) / 60000) * 10) / 10),
    fairness: debrief.fairness,
    participant: debrief.participant.trim(),
    notes: debrief.notes.trim(),
  };
}

export interface LogStats {
  sessions: number;
  agreements: number;
  agreementRate: number | null;
  averageRounds: number | null;
  averageFairness: number | null;
  participants: number;
}

export function logStats(entries: LogEntry[]): LogStats {
  const mean = (values: number[]) =>
    values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  const agreements = entries.filter((e) => e.outcome === 'agreement').length;
  const rated = entries.flatMap((e) => (e.fairness === null ? [] : [e.fairness]));
  return {
    sessions: entries.length,
    agreements,
    agreementRate: entries.length ? agreements / entries.length : null,
    averageRounds: mean(entries.map((e) => e.rounds)),
    averageFairness: mean(rated),
    participants: new Set(entries.map((e) => e.participant).filter(Boolean)).size,
  };
}

const CSV_COLUMNS: (keyof LogEntry)[] = [
  'at',
  'participant',
  'scenarioId',
  'scenarioTitle',
  'category',
  'mode',
  'people',
  'customised',
  'outcome',
  'rounds',
  'minutes',
  'fairness',
  'notes',
];

function csvCell(value: unknown): string {
  let cell = value === null || value === undefined ? '' : String(value);
  // Stop spreadsheet apps from treating a free-text note as a formula.
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  return /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

export function toCsv(entries: LogEntry[]): string {
  const rows = entries.map((entry) => CSV_COLUMNS.map((column) => csvCell(entry[column])).join(','));
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}
