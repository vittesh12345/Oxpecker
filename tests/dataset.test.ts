import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { datasetCard } from '../src/dataset/card';
import { DATA_FILES, buildDataset, puzzleRows, toJsonl } from '../src/dataset/build';
import { templates } from '../src/scenarios';

const data = buildDataset();
const root = join(__dirname, '..', 'dataset');

describe('published dataset', () => {
  it('matches the generator byte for byte (run `npm run dataset` after changing scenarios)', () => {
    for (const [part, path] of Object.entries(DATA_FILES)) {
      const committed = readFileSync(join(root, path), 'utf8');
      expect(committed, path).toBe(toJsonl(data[part as keyof typeof data]));
    }
    expect(readFileSync(join(root, 'README.md'), 'utf8')).toBe(datasetCard(data));
  });

  it('is reproducible', () => {
    expect(toJsonl(puzzleRows(templates[0]))).toBe(toJsonl(puzzleRows(templates[0])));
  });

  it('keeps every data file small enough to avoid large-file storage', () => {
    for (const part of Object.keys(DATA_FILES)) {
      const bytes = Buffer.byteLength(toJsonl(data[part as keyof typeof data]));
      expect(bytes, part).toBeLessThan(10 * 1024 * 1024);
    }
  });
});

describe('scenarios in the dataset', () => {
  it('show every figure that a limit or priority depends on', () => {
    for (const row of data.scenarios) {
      for (const person of row.people as {
        name: string;
        measures: { key: string }[];
        limits: { measure: string | null }[];
        priorities: { weights: { measure: string }[] }[];
      }[]) {
        const shown = person.measures.map((m) => m.key);
        for (const limit of person.limits) {
          if (limit.measure) expect(shown, `${row.scenario_id} ${person.name}`).toContain(limit.measure);
        }
        for (const priority of person.priorities) {
          for (const w of priority.weights) expect(shown, `${row.scenario_id} ${person.name}`).toContain(w.measure);
        }
      }
    }
  });
});

describe('puzzles', () => {
  const puzzles = [...data.puzzlesTrain, ...data.puzzlesTest] as {
    puzzle_id: string;
    scenario_id: string;
    split: string;
    prompt: string;
    answer: string;
    arrangement_count: number;
    respecting: number[];
    most_balanced: number[];
    closest: number | null;
  }[];

  it('cover every scenario in both splits', () => {
    for (const template of templates) {
      const mine = puzzles.filter((p) => p.scenario_id === template.id);
      expect(mine.some((p) => p.split === 'train')).toBe(true);
      expect(mine.some((p) => p.split === 'test')).toBe(true);
    }
    expect(new Set(puzzles.map((p) => p.puzzle_id)).size).toBe(puzzles.length);
  });

  it('have answers that agree with their labels', () => {
    for (const p of puzzles) {
      for (const n of [...p.respecting, ...p.most_balanced, p.closest ?? 1]) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(p.arrangement_count);
      }
      for (const n of p.most_balanced) expect(p.respecting).toContain(n);
      if (p.respecting.length) {
        expect(p.most_balanced.length).toBeGreaterThan(0);
        expect(p.closest).toBeNull();
        expect(p.answer).toContain(p.respecting.map((n) => `#${n}`).join(', '));
      } else {
        expect(p.most_balanced).toEqual([]);
        expect(p.answer).toContain('No arrangement respects');
        if (p.closest !== null) expect(p.answer).toContain(`Closest: #${p.closest}`);
      }
    }
  });

  it('include a healthy share of each kind of answer', () => {
    const none = puzzles.filter((p) => p.respecting.length === 0).length / puzzles.length;
    expect(none).toBeGreaterThan(0.15);
    expect(none).toBeLessThan(0.45);
  });

  it('state today’s arrangement and the three rules in every prompt', () => {
    for (const p of puzzles) {
      expect(p.prompt).toContain('Today’s arrangement (not one of the options): ');
      expect(p.prompt).toContain('1. Which arrangements respect every person’s limits?');
      expect(p.prompt).toContain('or by 1 when the limit is 0');
      expect(p.prompt).toContain(`(${p.arrangement_count} in all)`);
    }
  });
});
