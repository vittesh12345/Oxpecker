import { useMemo, useState } from 'react';
import type { Facts, FactSpec, Scenario, ScenarioTemplate } from '../engine/types';
import { categoryLabels, defaultFacts } from '../scenarios';
import type { Mode } from '../session/session';
import { gap } from './bits';

export interface StartRequest {
  scenario: Scenario;
  mode: Mode;
  soloRole?: string;
  customised: boolean;
}

interface Props {
  template: ScenarioTemplate;
  onBack: () => void;
  onStart: (request: StartRequest) => void;
}

/** Reads a typed-in figure, or returns null when it is missing or out of range. */
function parseFact(spec: FactSpec, raw: string): string | number | null {
  if (spec.kind === 'text') return raw.trim() ? raw.trim().slice(0, 24) : null;
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) return null;
  if (spec.min !== undefined && value < spec.min) return null;
  if (spec.max !== undefined && value > spec.max) return null;
  return value;
}

export function Brief({ template, onBack, onStart }: Props) {
  const defaults = useMemo(() => defaultFacts(template), [template]);
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(template.facts.map((f) => [f.id, String(f.value)])),
  );
  const [mode, setMode] = useState<Mode>('together');
  const [soloRole, setSoloRole] = useState('');

  const invalid = template.facts.filter((f) => parseFact(f, drafts[f.id]) === null).map((f) => f.id);
  const facts: Facts = useMemo(() => {
    const merged: Facts = { ...defaults };
    for (const spec of template.facts) {
      const parsed = parseFact(spec, drafts[spec.id]);
      if (parsed !== null) merged[spec.id] = parsed;
    }
    return merged;
  }, [defaults, drafts, template]);

  const scenario = useMemo(() => template.build(facts), [template, facts]);
  const customised = template.facts.some((f) => facts[f.id] !== defaults[f.id]);
  const role = scenario.parties.some((p) => p.id === soloRole) ? soloRole : scenario.parties[0].id;
  const groups = [...new Set(template.facts.map((f) => f.group))];

  return (
    <>
      <div className="stack" style={gap('0.6rem')}>
        <button type="button" className="navlink" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          ← All scenarios
        </button>
        <p className="eyebrow">
          {categoryLabels[scenario.category]} · {scenario.setting} ·{' '}
          {scenario.recurring ? 'ongoing arrangement' : 'one week'}
        </p>
        <h1>{scenario.title}</h1>
      </div>

      <div className="brief">
        <div className="brief-main">
          <section className="prose" aria-label="The situation">
            {scenario.story.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {scenario.caution && <p className="notice">{scenario.caution}</p>}
          </section>

          <section className="stack" style={gap('0.5rem')}>
            <h2>Who’s involved</h2>
            <ul className="people">
              {scenario.parties.map((party) => (
                <li key={party.id}>
                  <span className="who">
                    <span className="name">{party.name}</span>
                    <span className="muted small">{party.role}</span>
                  </span>
                  <span>{party.publicBrief}</span>
                </li>
              ))}
            </ul>
            <p className="muted small">
              Each person also gets a private brief and sets their own limits once the session
              starts.
            </p>
          </section>

          <section className="stack" style={gap('0.5rem')}>
            <h2>What’s on the table</h2>
            <div>
              {scenario.issues.map((issue) => (
                <div key={issue.id} className="table-issue">
                  <h3>{issue.label}</h3>
                  <ul>
                    {issue.options.map((option) => {
                      const today = scenario.baseline[issue.id] === option.id;
                      return (
                        <li key={option.id} className={today ? 'today' : undefined}>
                          {option.label}
                          {today && ' · today'}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
            <p className="muted small">
              If nobody agrees to anything, things stay as they are today.
            </p>
          </section>
        </div>

        <aside className="sheet setup" aria-label="Start a session">
          <h2>Run it</h2>
          <fieldset>
            <legend>How are you playing?</legend>
            <label className="option">
              <input
                type="radio"
                name="mode"
                id="mode-together"
                checked={mode === 'together'}
                onChange={() => setMode('together')}
              />
              <span>
                <strong>Together, on one device.</strong>{' '}
                <span className="muted">Pass it around. A cover screen hides each private turn.</span>
              </span>
            </label>
            <label className="option">
              <input
                type="radio"
                name="mode"
                id="mode-solo"
                checked={mode === 'solo'}
                onChange={() => setMode('solo')}
              />
              <span>
                <strong>Solo practice.</strong>{' '}
                <span className="muted">You speak for one person. The tool plays everyone else.</span>
              </span>
            </label>
          </fieldset>

          {mode === 'solo' && (
            <fieldset>
              <legend>Who do you speak for?</legend>
              {scenario.parties.map((party) => (
                <label key={party.id} className="option">
                  <input
                    type="radio"
                    name="role"
                    id={`role-${party.id}`}
                    checked={role === party.id}
                    onChange={() => setSoloRole(party.id)}
                  />
                  <span>
                    {party.name} <span className="muted">· {party.role}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              onStart({ scenario, mode, soloRole: mode === 'solo' ? role : undefined, customised })
            }
          >
            Start the session
          </button>

          <details className="adapt">
            <summary>Use your own names and numbers</summary>
            <div className="facts">
              <p className="muted small">
                Swap in a real situation. These details stay on this device and are gone when you
                close the page.
              </p>
              {groups.map((group) => (
                <div key={group} className="fact-group">
                  <p className="eyebrow">{group}</p>
                  {template.facts
                    .filter((f) => f.group === group)
                    .map((spec) => (
                      <div key={spec.id} className="field">
                        <label htmlFor={`fact-${spec.id}`}>{spec.label}</label>
                        <input
                          id={`fact-${spec.id}`}
                          type={spec.kind === 'text' ? 'text' : 'number'}
                          inputMode={spec.kind === 'text' ? undefined : 'decimal'}
                          min={spec.min}
                          max={spec.max}
                          step={spec.step}
                          maxLength={spec.kind === 'text' ? 24 : undefined}
                          value={drafts[spec.id]}
                          aria-invalid={invalid.includes(spec.id)}
                          onChange={(event) =>
                            setDrafts((d) => ({ ...d, [spec.id]: event.target.value }))
                          }
                        />
                      </div>
                    ))}
                </div>
              ))}
              {invalid.length > 0 && (
                <p className="notice notice-warn">
                  Some fields are empty or out of range. The practice figure is used for those.
                </p>
              )}
              {customised && (
                <button
                  type="button"
                  className="btn btn-quiet"
                  style={{ justifySelf: 'start' }}
                  onClick={() =>
                    setDrafts(Object.fromEntries(template.facts.map((f) => [f.id, String(f.value)])))
                  }
                >
                  Reset to the practice figures
                </button>
              )}
            </div>
          </details>
        </aside>
      </div>
    </>
  );
}
