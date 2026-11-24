import { useEffect, useState } from 'react';
import { partyOf } from '../engine/engine';
import { currentParty, type Action, type SessionState } from '../session/session';
import { LimitsStep } from './Limits';
import { ResultStep } from './Result';
import { ReviewStep } from './Review';
import { PrivacyGate, PrivateBanner, Terms, gap, usePrivateBackdrop } from './bits';

interface Props {
  state: SessionState;
  dispatch: (action: Action) => void;
  onFinish: () => void;
}

const STAGES: { phase: SessionState['phase']; label: string }[] = [
  { phase: 'limits', label: 'Private limits' },
  { phase: 'proposals', label: 'Proposals' },
  { phase: 'review', label: 'Private answers' },
  { phase: 'result', label: 'Outcome' },
];

/** Runs one session: private turns behind a cover screen, shared screens in the open. */
export function SessionView({ state, dispatch, onFinish }: Props) {
  const { scenario } = state;
  const partyId = currentParty(state);
  const party = partyId ? partyOf(scenario, partyId) : null;
  const solo = state.mode === 'solo';

  // A private turn must be opened by the person it belongs to. The key changes
  // with every turn, so the cover screen comes back for the next person.
  const turnKey = `${state.phase}:${state.round}:${state.turn}:${state.revision ? 'revisit' : 'first'}`;
  const [opened, setOpened] = useState<string | null>(null);
  const covered = !solo && party !== null && opened !== turnKey;

  usePrivateBackdrop(party !== null);
  useEffect(() => {
    if (party === null) setOpened(null);
  }, [party]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [turnKey, covered, state.result?.kind]);

  let body;
  if (party && covered) {
    const purpose =
      state.phase === 'limits'
        ? state.revision
          ? `${party.name} takes another look at their own limits.`
          : `${party.name} sets private limits on pay and availability.`
        : `${party.name} sees what each proposal would mean for them and answers in private.`;
    body = <PrivacyGate name={party.name} purpose={purpose} onReveal={() => setOpened(turnKey)} />;
  } else if (party && state.phase === 'limits') {
    body = (
      <>
        <PrivateBanner name={party.name} solo={solo} />
        <LimitsStep
          key={turnKey}
          state={state}
          party={party}
          onLock={(values, pref) =>
            dispatch({ type: 'lock-limits', partyId: party.id, values, pref })
          }
        />
      </>
    );
  } else if (party && state.phase === 'review') {
    body = (
      <>
        <PrivateBanner name={party.name} solo={solo} />
        <ReviewStep
          key={turnKey}
          state={state}
          party={party}
          onSubmit={(replies, tighten) =>
            dispatch({ type: 'submit-review', partyId: party.id, replies, tighten })
          }
        />
      </>
    );
  } else if (state.phase === 'proposals') {
    const count = state.proposals.length;
    const first = partyOf(scenario, state.humans[0]);
    body = (
      <section className="stack" style={gap('1.25rem')} aria-labelledby="proposals-title">
        <div className="stack" style={gap('0.5rem')}>
          <p className="eyebrow">Round {state.round}</p>
          <h2 id="proposals-title">
            {count === 1 ? 'One proposal fits' : `${count} proposals fit`} everyone’s limits
          </h2>
          <p className="lede">
            These are the terms, for everyone to read. What each one means for your own pay and
            hours comes next, in private.
          </p>
        </div>
        <div className="proposals">
          {state.proposals.map((proposal) => (
            <article key={proposal.key} className="sheet proposal">
              <header className="proposal-head">
                <span className="letter" aria-hidden="true">
                  {proposal.letter}
                </span>
                <h3>Proposal {proposal.letter}</h3>
                {proposal.top && <span className="tag">Most balanced</span>}
                {proposal.returning && <span className="tag tag-quiet">Back on the table</span>}
              </header>
              <Terms scenario={scenario} choices={proposal.choices} />
            </article>
          ))}
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'begin-review' })}
          >
            {solo ? `See what each means for ${first.name}` : `Start private answers: ${first.name} first`}
          </button>
        </div>
      </section>
    );
  } else {
    body = <ResultStep state={state} dispatch={dispatch} onFinish={onFinish} />;
  }

  return (
    <>
      <ol className="progress" aria-label="Session progress">
        {STAGES.map((stage) => (
          <li key={stage.phase} aria-current={state.phase === stage.phase ? 'step' : undefined}>
            {stage.label}
          </li>
        ))}
      </ol>
      {body}
    </>
  );
}
