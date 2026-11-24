import type { PartyId, Scenario } from '../../engine/types';

/** The animals an oxpecker rides on. Each person in a scenario is drawn as one of them. */
export const SPECIES = ['zebra', 'giraffe', 'rhino', 'hippo', 'buffalo'] as const;
export type Species = (typeof SPECIES)[number];

/**
 * Gives every person in a scenario a different animal. The choice depends
 * only on the scenario and the person's place in it, never on their name,
 * so rewriting a scenario with real names changes nobody's character.
 */
export function castFor(scenario: Pick<Scenario, 'id' | 'parties'>): Record<PartyId, Species> {
  const offset =
    [...scenario.id].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % SPECIES.length;
  return Object.fromEntries(
    scenario.parties.map((party, index) => [
      party.id,
      SPECIES[(offset + index) % SPECIES.length],
    ]),
  );
}
