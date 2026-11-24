import { relaxTo, suggestedLimits } from './engine';
import { round2 } from './format';
import { intBetween, pick, type Rng } from './rng';
import type { LimitValues, NumericLimitSpec, Party, PartyId, Ranked, Violation } from './types';

/**
 * Stand-in for the people who are not at the keyboard in solo practice.
 * It holds private limits of its own, answers proposals, and gives a little
 * ground when pushed, so one person can rehearse a whole negotiation.
 */

export type Reply = 'accept' | 'decline';

/**
 * Hidden limits for a simulated person: the scenario's suggested limits,
 * each loosened by zero to two steps so the exact numbers differ per session.
 */
export function simulatedSetup(party: Party, rng: Rng): { limits: LimitValues; pref: string } {
  const limits = suggestedLimits(party);
  for (const spec of party.limits) {
    if (spec.kind === 'unavailable') continue;
    const value = limits[spec.id];
    if (typeof value !== 'number') continue;
    const slack = intBetween(rng, 0, 2) * spec.step;
    limits[spec.id] = round2(spec.kind === 'min' ? value - slack : value + slack);
  }
  return { limits, pref: pick(rng, party.priorities).id };
}

/** How good a proposal must be for a simulated person to say yes. Drops each round. */
export function acceptThreshold(round: number): number {
  return Math.max(0, 0.5 - 0.2 * (round - 1));
}

/**
 * Every proposal already respects the simulated person's limits, so the only
 * question is whether they hold out for something better. They start choosy
 * and by the fourth round accept anything within their limits.
 */
export function simulatedReplies(
  partyId: PartyId,
  proposals: Ranked[],
  round: number,
): Record<string, Reply> {
  const threshold = acceptThreshold(round);
  const replies: Record<string, Reply> = {};
  for (const proposal of proposals) {
    replies[proposal.key] = proposal.utilities[partyId] >= threshold - 1e-9 ? 'accept' : 'decline';
  }
  return replies;
}

/** Largest overshoot, relative to the limit, that a simulated person will give up. */
export const CONCESSION = 0.12;

/**
 * When nothing fits, a simulated person moves a numeric limit to meet the
 * closest arrangement if that costs them 12% or less. Availability never moves.
 */
export function simulatedConcession(
  party: Party,
  values: LimitValues,
  found: Violation[],
): { values: LimitValues; moved: boolean } {
  const next = { ...values };
  let moved = false;
  for (const violation of found) {
    if (violation.kind === 'unavailable' || violation.actual === undefined) continue;
    const spec = party.limits.find((l) => l.id === violation.limitId) as NumericLimitSpec;
    const limit = values[spec.id];
    if (typeof limit !== 'number') continue;
    const relative = (violation.gap ?? 0) / Math.max(Math.abs(limit), spec.step);
    if (relative <= CONCESSION) {
      next[spec.id] = relaxTo(spec, violation.actual);
      moved = true;
    }
  }
  return { values: next, moved };
}
