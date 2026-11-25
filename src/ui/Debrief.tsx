import { useState } from 'react';
import type { Debrief } from '../session/log';
import { isOver, type SessionState } from '../session/session';
import { gap } from './bits';
import { Guide } from './toons/Toons';

interface Props {
  state: SessionState;
  canSave: boolean;
  onSave: (debrief: Debrief) => void;
  onSkip: () => void;
}

const SCALE = [1, 2, 3, 4, 5];

/** A short reflection after a session, saved to the practice log on this device. */
export function DebriefForm({ state, canSave, onSave, onSkip }: Props) {
  const [fairness, setFairness] = useState<number | null>(null);
  const [participant, setParticipant] = useState('');
  const [notes, setNotes] = useState('');
  const agreed = state.result?.kind === 'agreement' && isOver(state);

  return (
    <section className="outcome" aria-labelledby="debrief-title">
      <Guide mood="point" size={76}>
        Half a minute. It makes the next session better.
      </Guide>
      <div className="stack" style={gap('0.5rem')}>
        <p className="eyebrow">
          {state.scenario.title} · {agreed ? 'agreement' : 'no deal'} ·{' '}
          {state.round === 1 ? '1 round' : `${state.round} rounds`}
        </p>
        <h2 id="debrief-title">How did that go?</h2>
        <p className="lede">
          A quick note for the practice log. It records how the session went, never anyone’s
          limits or answers.
          {state.research &&
            ' Separately, research mode recorded the answers of the people who agreed, without names or limits.'}
        </p>
      </div>

      <form
        className="sheet"
        onSubmit={(event) => {
          event.preventDefault();
          onSave({ fairness, participant, notes });
        }}
      >
        <div className="field">
          <span className="label" id="fairness-label">
            How fair did the result feel?
          </span>
          <div className="scale" role="group" aria-labelledby="fairness-label">
            {SCALE.map((n) => (
              <button
                key={n}
                type="button"
                className="chip"
                aria-pressed={fairness === n}
                aria-label={`${n} out of 5`}
                onClick={() => setFairness(fairness === n ? null : n)}
              >
                {n}
              </button>
            ))}
          </div>
          <span className="muted small">1 is very unfair, 5 is very fair.</span>
        </div>

        <div className="field">
          <label htmlFor="debrief-participant">Participant code (optional)</label>
          <input
            id="debrief-participant"
            type="text"
            maxLength={24}
            placeholder="P07"
            value={participant}
            onChange={(event) => setParticipant(event.target.value)}
            style={{ maxWidth: '12rem' }}
          />
          <span className="muted small">Use a code, not a name, if you plan to share the log.</span>
        </div>

        <div className="field">
          <label htmlFor="debrief-notes">What should the tool have handled differently?</label>
          <textarea
            id="debrief-notes"
            rows={4}
            maxLength={600}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        {!canSave && (
          <p className="notice notice-warn">
            This browser is blocking storage, so the log can’t be saved here.
          </p>
        )}

        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={!canSave}>
            Save to the practice log
          </button>
          <button type="button" className="btn btn-quiet" onClick={onSkip}>
            Skip
          </button>
        </div>
      </form>
    </section>
  );
}
