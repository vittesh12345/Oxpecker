import { baselineOf, partyOf } from '../engine/engine';
import { agreedProposal, type Action, type SessionState } from '../session/session';
import { CopyButton, Figures, Terms, gap, termsText } from './bits';

interface Props {
  state: SessionState;
  dispatch: (action: Action) => void;
  onFinish: () => void;
}

function agreementText(state: SessionState, letter: string, choices: Record<string, string>): string {
  const { scenario } = state;
  return [
    `Agreement: ${scenario.title}`,
    `Between: ${scenario.parties.map((p) => p.name).join(', ')}`,
    '',
    `Proposal ${letter}`,
    ...termsText(scenario, choices).map((line) => `- ${line}`),
    '',
    'Each person accepted these terms privately. Worked out with Oxpecker.',
  ].join('\n');
}

/** What happened after everyone answered: a deal, no match, or no overlap at all. */
export function ResultStep({ state, dispatch, onFinish }: Props) {
  const { scenario, result } = state;
  if (!result) return null;
  const solo = state.mode === 'solo';
  const revise = (label: string) => (
    <button type="button" className="btn" onClick={() => dispatch({ type: 'revise-limits' })}>
      {label}
    </button>
  );
  const walkAway = (
    <button type="button" className="btn btn-quiet" onClick={() => dispatch({ type: 'end' })}>
      End without a deal
    </button>
  );

  if (result.kind === 'agreement') {
    const agreed = agreedProposal(state);
    if (!agreed) {
      const matches = state.proposals.filter((p) => result.matches.includes(p.key));
      return (
        <section className="stack" aria-labelledby="result-title">
          <div className="stack" style={gap('0.5rem')}>
            <p className="eyebrow">Round {state.round}</p>
            <h2 id="result-title">Everyone said yes to more than one</h2>
            <p className="lede">
              Any of these would hold. {solo ? 'Pick the one you want.' : 'Pick one together.'}
            </p>
          </div>
          <div className="proposals">
            {matches.map((proposal) => (
              <article key={proposal.key} className="sheet proposal">
                <header className="proposal-head">
                  <span className="letter" aria-hidden="true">
                    {proposal.letter}
                  </span>
                  <h3>Proposal {proposal.letter}</h3>
                  {proposal.top && <span className="tag">Most balanced</span>}
                </header>
                <Terms scenario={scenario} choices={proposal.choices} />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => dispatch({ type: 'choose', key: proposal.key })}
                >
                  Go with {proposal.letter}
                </button>
              </article>
            ))}
          </div>
        </section>
      );
    }

    const player = solo ? partyOf(scenario, state.humans[0]) : null;
    return (
      <section className="outcome" aria-labelledby="result-title">
        <div className="stack" style={gap('0.5rem')}>
          <p className="eyebrow">
            Agreed in round {state.round}
          </p>
          <h2 id="result-title">It’s a deal: Proposal {agreed.letter}</h2>
          <p className="lede">
            {solo
              ? 'You and the other side each said yes to this one.'
              : 'Everyone said yes to this one, each in private.'}
          </p>
        </div>
        <div className="sheet">
          <Terms scenario={scenario} choices={agreed.choices} />
        </div>
        {player && (
          <div className="sheet">
            <h3>What it means for {player.name}</h3>
            <Figures
              metrics={player.metrics}
              outcome={agreed.outcomes[player.id]}
              against={baselineOf(scenario).outcomes[player.id]}
              recurring={scenario.recurring}
            />
          </div>
        )}
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onFinish}>
            Finish and log the session
          </button>
          <CopyButton
            id="agreement-text"
            label="Copy the agreement"
            text={agreementText(state, agreed.letter, agreed.choices)}
          />
        </div>
      </section>
    );
  }

  if (result.kind === 'ended') {
    return (
      <section className="outcome" aria-labelledby="result-title">
        <div className="stack" style={gap('0.5rem')}>
          <p className="eyebrow">No agreement</p>
          <h2 id="result-title">Ended without a deal</h2>
          <p className="lede">Things stay as they are today.</p>
        </div>
        <div className="sheet">
          <Terms scenario={scenario} choices={scenario.baseline} />
        </div>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onFinish}>
            Finish and log the session
          </button>
        </div>
      </section>
    );
  }

  if (result.kind === 'no-overlap') {
    return (
      <section className="outcome" aria-labelledby="result-title">
        <div className="stack" style={gap('0.5rem')}>
          <p className="eyebrow">No proposals</p>
          <h2 id="result-title">Nothing fits everyone’s limits at once</h2>
          <p className="lede">
            No arrangement on the table is inside every person’s limits, so there is nothing to
            propose that respects them all.
          </p>
        </div>
        <p className="sheet">
          {solo
            ? 'You can check whether one of your own limits is what the closest arrangement misses. The other side will reconsider theirs too.'
            : 'Each person can check, privately, whether one of their own limits is what the closest arrangement misses. Nobody is shown anyone else’s.'}
        </p>
        <div className="row">
          {revise(solo ? 'Check my limits' : 'Check limits privately')}
          {walkAway}
        </div>
      </section>
    );
  }

  if (result.kind === 'exhausted') {
    return (
      <section className="outcome" aria-labelledby="result-title">
        <div className="stack" style={gap('0.5rem')}>
          <p className="eyebrow">Round {state.round}</p>
          <h2 id="result-title">That was every option that fits</h2>
          <p className="lede">
            Each arrangement inside everyone’s limits has been offered and turned down by someone.
          </p>
        </div>
        <p className="sheet">
          Revisiting limits puts declined proposals back on the table, along with anything new that
          a changed limit lets in.
        </p>
        <div className="row">
          {revise(solo ? 'Revisit my limits' : 'Revisit limits privately')}
          {walkAway}
        </div>
      </section>
    );
  }

  return (
    <section className="outcome" aria-labelledby="result-title">
      <div className="stack" style={gap('0.5rem')}>
        <p className="eyebrow">Round {state.round}</p>
        <h2 id="result-title">No proposal got a yes from everyone</h2>
        <p className="lede">
          {solo
            ? 'The other side’s answers stay hidden, the same as yours.'
            : 'Who said what stays private. Only a proposal everyone accepts is ever revealed.'}
        </p>
      </div>
      <p className="sheet">
        {result.moreOptions
          ? 'There are other arrangements inside everyone’s limits that have not been offered yet.'
          : 'Nothing else fits everyone’s limits as they stand. Revisiting limits can bring declined proposals back.'}
      </p>
      <div className="row">
        {result.moreOptions && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => dispatch({ type: 'next-round' })}
          >
            Show different options
          </button>
        )}
        {revise(solo ? 'Revisit my limits' : 'Revisit limits privately')}
        {walkAway}
      </div>
    </section>
  );
}
