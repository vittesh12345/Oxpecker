import type { Category, Facts, Scenario, ScenarioTemplate } from '../engine/types';
import { fridayDinner } from './fridayDinner';
import { holidayWeekend } from './holidayWeekend';
import { keyholderRaise } from './keyholderRaise';
import { kitchenShare } from './kitchenShare';
import { lastBus } from './lastBus';
import { outsideOffer } from './outsideOffer';
import { saturdaySwap } from './saturdaySwap';
import { tipJar } from './tipJar';

export const templates: ScenarioTemplate[] = [
  saturdaySwap,
  holidayWeekend,
  lastBus,
  kitchenShare,
  tipJar,
  fridayDinner,
  keyholderRaise,
  outsideOffer,
];

export const categoryLabels: Record<Category, string> = {
  'shift-trade': 'Shift trade',
  'tip-split': 'Tip split',
  wage: 'Wage talk',
};

export function templateById(id: string): ScenarioTemplate {
  const template = templates.find((t) => t.id === id);
  if (!template) throw new Error(`Unknown scenario "${id}"`);
  return template;
}

export function defaultFacts(template: ScenarioTemplate): Facts {
  return Object.fromEntries(template.facts.map((f) => [f.id, f.value]));
}

/** Builds a scenario from its template, using the practice figures unless others are given. */
export function buildScenario(template: ScenarioTemplate, facts?: Facts): Scenario {
  return template.build({ ...defaultFacts(template), ...facts });
}
