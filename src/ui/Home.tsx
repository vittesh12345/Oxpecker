import { useState } from 'react';
import type { Category } from '../engine/types';
import { buildScenario, categoryLabels, templates } from '../scenarios';
import { gap } from './bits';
import { Bird } from './toons/Bird';
import { Critter } from './toons/Critter';
import { castFor } from './toons/cast';

const filters: { id: Category | 'all'; label: string }[] = [
  { id: 'all', label: 'All 8' },
  { id: 'shift-trade', label: 'Shift trades' },
  { id: 'tip-split', label: 'Tip splits' },
  { id: 'wage', label: 'Wage talks' },
];

/** The characters each scenario is played with, in the order its people appear. */
const casts = Object.fromEntries(
  templates.map((t) => [t.id, Object.values(castFor(buildScenario(t)))]),
);

export function Home({ onOpen }: { onOpen: (templateId: string) => void }) {
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const shown = templates.filter((t) => filter === 'all' || t.category === filter);

  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Pay and scheduling simulator</p>
          <h1>Work out the shift, the split or the raise.</h1>
          <p className="lede">
            Pick a situation. Each person sets private limits on pay and availability. PaySim
            only proposes arrangements inside everyone’s limits, and shows each person what they
            would earn and work under every option before anyone says yes.
          </p>
        </div>
        <div className="toon hero-art">
          <p className="speech speech-down">Tell me your limits. I won’t tell a soul.</p>
          <div className="perch">
            <Bird mood="wave" size={112} />
            <Critter species="buffalo" size={150} />
          </div>
        </div>
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
              <span className="card-bottom">
                <span className="card-foot">
                  {t.setting} · {t.recurring ? 'ongoing' : 'one week'}
                </span>
                <span className="toon card-cast">
                  {casts[t.id].map((species, index) => (
                    <Critter key={species} species={species} size={34} delay={index * 0.9} />
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>
        <p className="muted small">
          Every scenario can be rewritten with your own names, wages and hours, so the same steps
          work for a real disagreement.
        </p>
      </section>

      <section className="sheet model-note" aria-labelledby="model-title">
        <div className="stack" style={gap('0.6rem')}>
          <p className="eyebrow">Behind the research</p>
          <h2 id="model-title">A model of human choice</h2>
          <p>
            I trained a small language model to predict what people actually choose, using
            Psych-101: real choices from 160 psychology experiments. PaySim’s research mode records
            workplace decisions in the same format, so the model can be tested on pay and
            scheduling choices, not just lab tasks.
          </p>
          <p className="model-stat">
            On 139 people it had never seen, its average surprise at each of their choices fell
            from <span className="num">0.99</span> to <span className="num">0.84</span>
            <span className="muted small"> (negative log-likelihood per choice; lower is better)</span>
          </p>
          <div className="row">
            <a
              className="btn"
              href="https://huggingface.co/EthanChen72/human-choice-qwen2.5-0.5b-lora"
              target="_blank"
              rel="noreferrer"
            >
              See the model on Hugging Face
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
