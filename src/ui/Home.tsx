import { useState } from 'react';
import type { Category } from '../engine/types';
import { categoryLabels, templates } from '../scenarios';

const filters: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All 8' },
  { id: 'shift-trade', label: 'Shift trades' },
  { id: 'tip-split', label: 'Tip splits' },
  { id: 'wage', label: 'Wage talks' },
];

export function Home({ onOpen }: { onOpen: (templateId: string) => void }) {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const shown = templates.filter((t) => filter === 'all' || t.category === filter);

  return (
    <>
      <section className="hero">
        <p className="eyebrow">Pay and scheduling simulator</p>
        <h1>Work out the shift, the split or the raise.</h1>
        <p className="lede">
          Pick a situation. Each person sets private limits on pay and availability. Oxpecker only
          proposes arrangements inside everyone’s limits, and shows each person what they would
          earn and work under every option before anyone says yes.
        </p>
      </section>

      <ol className="steps" aria-label="How a session runs">
        <li>
          <strong>Set limits in private</strong>
          <span>
            The least you can accept, the most you can work, the shifts you can’t do. Nobody else
            sees them.
          </span>
        </li>
        <li>
          <strong>Compare what you’d get</strong>
          <span>
            Projected pay, hours and trade-offs for each proposal, next to how things stand today.
          </span>
        </li>
        <li>
          <strong>Answer in private</strong>
          <span>
            Say yes or no to each one. Only a proposal everyone accepts is revealed as the deal.
          </span>
        </li>
      </ol>

      <section className="stack" aria-labelledby="library-title">
        <div className="library-head">
          <h2 id="library-title">Scenarios</h2>
          <div className="chips" role="group" aria-label="Filter scenarios">
            {filters.map((f) => (
              <button
                key={f.id}
                type="button"
                className="chip"
                aria-pressed={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cards">
          {shown.map((t) => (
            <button key={t.id} type="button" className="card" onClick={() => onOpen(t.id)}>
              <span className="card-top">
                <span className="eyebrow">{categoryLabels[t.category]}</span>
                <span className="card-foot">{t.people}</span>
              </span>
              <span className="card-title">{t.title}</span>
              <span className="card-summary">{t.summary}</span>
              <span className="card-foot">
                {t.setting} · {t.recurring ? 'ongoing' : 'one week'}
              </span>
            </button>
          ))}
        </div>
        <p className="muted small">
          Every scenario can be rewritten with your own names, wages and hours, so the same steps
          work for a real disagreement.
        </p>
      </section>
    </>
  );
}
