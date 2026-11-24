import { describe, expect, it } from 'vitest';
import { buildScenario, defaultFacts, templates } from '../src/scenarios';
import { SPECIES, castFor } from '../src/ui/toons/cast';

describe('character casting', () => {
  it('gives every person in a scenario a different animal', () => {
    for (const template of templates) {
      const scenario = buildScenario(template);
      const cast = castFor(scenario);
      const animals = scenario.parties.map((p) => cast[p.id]);
      expect(animals.every((animal) => SPECIES.includes(animal))).toBe(true);
      expect(new Set(animals).size, template.id).toBe(scenario.parties.length);
    }
  });

  it('does not depend on anyone’s name', () => {
    for (const template of templates) {
      const renamed = defaultFacts(template);
      for (const fact of template.facts) {
        if (fact.kind === 'text') renamed[fact.id] = `Someone ${fact.id}`;
      }
      expect(castFor(buildScenario(template, renamed))).toEqual(castFor(buildScenario(template)));
    }
  });

  it('uses the whole cast across the scenario library', () => {
    const used = new Set(templates.flatMap((t) => Object.values(castFor(buildScenario(t)))));
    expect([...used].sort()).toEqual([...SPECIES].sort());
  });
});
