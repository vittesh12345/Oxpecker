// Writes the Hugging Face dataset into ./dataset: the data files and the
// dataset card. Run with `npm run dataset`.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { datasetCard } from '../src/dataset/card';
import { DATA_FILES, buildDataset, toJsonl } from '../src/dataset/build';

const root = 'dataset';
const data = buildDataset();

for (const [part, path] of Object.entries(DATA_FILES)) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  const rows = data[part as keyof typeof data];
  writeFileSync(file, toJsonl(rows));
  console.log(`${file}: ${rows.length} rows`);
}

writeFileSync(join(root, 'README.md'), datasetCard(data));
console.log(`${join(root, 'README.md')}: dataset card`);
