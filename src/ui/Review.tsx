import { useState } from 'react';
import { baselineOf, tradeoffs } from '../engine/engine';
import type { Party } from '../engine/types';
import type { Proposal, Reply, SessionState, Tightening } from '../session/session';
import { Figures, Terms, gap } from './bits';
import { Critter } from './toons/Critter';
import { castFor } from './toons/cast';

interface Props {
  state: SessionState;
  party: Party;
  onSubmit: (replies: Record<string, Reply>, tighten: Tightening[]) => void;
}

interface Reason {
  id: string;
  label: string;
  tightening: Tightening;
}

/** One-tap reasons for a decline. Each one maps onto tightening one of the person's own limits. */
function reasonsFor(state: SessionState, party: Party, proposal: Proposal): Reason[] {
  const slotLabel = (id: string) => state.scenario.slots.find((s) => s.id === id)?.label ?? id;
  const reasons: Reason[] = [];
  for (const spec of party.limits) {
    if (spec.kind === 'unavailable') {
      for (const slot of proposal.outcomes[party.id].shifts) {
        if (!spec.slots.includes(slot)) continue;
        reasons.push({
          id: `slot:${slot}`,
          label: `Can’t work ${slotLabel(slot)}`,
          tightening: { limitId: spec.id, slot },
        });
      }
    } else {
      reasons.push({
        id: `limit:${spec.id}`,
        label: spec.declineLabel,
        tightening: { limitId: spec.id, key: proposal.key },
      });
    }
  }
  return reasons;
}

/** One person's private comparison of the proposals, and their yes or no to each. */
export function ReviewStep({ state, party, onSubmit }: Props) {
  const { scenario } = state;
  const today = baselineOf(scenario).outcomes[party.id];
  const species = castFor(scenario)[party.id];
  const [replies, setReplies] = useState<Record<string, Reply>>({});
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  const slotLabel = (id: string) => scenario.slots.find((s) => s.id === id)?.label ?? id;
  const answered = state.proposals.every((p) => replies[p.key]);

  const submit = () => {
    const tighten: Tightening[] = [];
    for (const proposal of state.proposals) {
      if (replies[proposal.key] !== 'decline') continue;
      const chosen = picked[proposal.key] ?? [];
      for (const reason of reasonsFor(state, party, proposal)) {
        if (chosen.includes(reason.id)) tighten.push(reason.tightening);
      }
    }
    onSubmit(replies, tighten);
  };

  return (
    <div className="stack" style={gap('1.25rem')}>
      <section className="sheet stack" aria-labelledby="review-title">
        <h2 id="review-title">{party.name}, compare your options</h2>
        <p>
          Each proposal is inside your limits. Figures show what it would mean for you, against how
          things stand today. Answer each one. Only a proposal that everyone accepts is revealed.
        </p>
        <details>
          <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>
            Show how things stand for you today
          </summary>
          <div style={{ marginTop: '0.75rem', maxWidth: '26rem' }}>
            <Figures metrics={party.metrics} outcome={today} recurring={scenario.recurring} />
          </div>
        </details>
      </section>

      <div className="proposals">
        {state.proposals.map((proposal) => {
          const outcome = proposal.outcomes[party.id];
          const changes = tradeoffs(scenario, party, outcome, today);
          const reply = replies[proposal.key];
          const reasons = reasonsFor(state, party, proposal);
          const chosen = picked[proposal.key] ?? [];
          const nothingChanges =
            changes.gains.length + changes.costs.length + changes.other.length === 0;

          return (
            <article
              key={proposal.key}
              className="sheet proposal"
              aria-labelledby={`review-${proposal.letter}`}
            >
              <header className="proposal-head">
                <span className="letter" aria-hidden="true">
                  {proposal.letter}
                </span>
                <h3 id={`review-${proposal.letter}`}>Proposal {proposal.letter}</h3>
                {proposal.top && <span className="tag">Most balanced</span>}
                {proposal.returning && <span className="tag tag-quiet">Back on the table</span>}
              </header>

              <Terms scenario={scenario} choices={proposal.choices} />

              <Figures
                metrics={party.metrics}
                outcome={outcome}
                against={today}
                recurring={scenario.recurring}
              />

              {scenario.slots.length > 0 && (
                <div className="stack" style={gap('0.25rem')}>
                  <p className="eyebrow">Your shifts</p>
                  <p>
                    {outcome.shifts.length
                      ? outcome.shifts.map(slotLabel).join(' · ')
                      : 'None of the shifts in question'}
                  </p>
                </div>
              )}

              <div className="tradeoffs">
                {nothingChanges && <p className="muted">Nothing changes for you.</p>}
                {changes.gains.length > 0 && (
                  <div>
                    <p className="eyebrow">You gain</p>
                    <ul className="gain-list">
                      {changes.gains.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {changes.costs.length > 0 && (
                  <div>
                    <p className="eyebrow">You give up</p>
                    <ul className="cost-list">
                      {changes.costs.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {changes.other.length > 0 && (
                  <div>
                    <p className="eyebrow">Also changes</p>
                    <ul>
                      {changes.other.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              <hr className="tear" />

              <div className="replies" role="group" aria-label={`Your answer to proposal ${proposal.letter}`}>
                <Critter
                  species={species}
                  size={42}
                  mood={reply === 'accept' ? 'happy' : reply === 'decline' ? 'worried' : 'neutral'}
                />
                <button
                  type="button"
                  className="reply yes"
                  aria-pressed={reply === 'accept'}
                  onClick={() => setReplies((r) => ({ ...r, [proposal.key]: 'accept' }))}
                >
                  Works for me
                </button>
                <button
                  type="button"
                  className="reply no"
                  aria-pressed={reply === 'decline'}
                  onClick={() => setReplies((r) => ({ ...r, [proposal.key]: 'decline' }))}
                >
                  Not for me
                </button>
              </div>

              {reply === 'decline' && reasons.length > 0 && (
                <div className="stack" style={gap('0.5rem')}>
                  <p className="small">
                    <strong>What’s wrong with it?</strong> Optional. Your answer tightens your own
                    limit so the next round avoids it. Nobody else sees it.
                  </p>
                  <div className="chips">
                    {reasons.map((reason) => {
                      const on = chosen.includes(reason.id);
                      return (
                        <button
                          key={reason.id}
                          type="button"
                          className="chip"
                          aria-pressed={on}
                          onClick={() =>
                            setPicked((p) => ({
                              ...p,
                              [proposal.key]: on
                                ? chosen.filter((id) => id !== reason.id)
                                : [...chosen, reason.id],
                            }))
                          }
                        >
                          {reason.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <section className="sheet row" style={{ justifyContent: 'space-between' }}>
        <p className="muted small" style={{ flex: '1 1 16rem' }}>
          {answered
            ? 'Your answers are hidden as soon as you lock them in.'
            : 'Answer every proposal to continue.'}
        </p>
        <button type="button" className="btn btn-primary" disabled={!answered} onClick={submit}>
          Lock in my answers
        </button>
      </section>
    </div>
  );
}
