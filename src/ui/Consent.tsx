import { useState } from 'react';
import { cleanCode, type Consent } from '../session/research';
import { gap } from './bits';

interface Props {
  name: string;
  onAnswer: (consent: Consent) => void;
}

/** Asked privately, once per person, before their first private screen in research mode. */
export function ConsentStep({ name, onAnswer }: Props) {
  const [code, setCode] = useState('');

  return (
    <section className="sheet stack consent" aria-labelledby="consent-title" style={{ maxWidth: '40rem' }}>
      <p className="eyebrow">Research mode</p>
      <h2 id="consent-title">{name}, can your answers be recorded for research?</h2>
      <p>
        This session is collecting answers to study how people weigh pay, hours and fairness when
        they decide. Only people who say yes are recorded, and saying no changes nothing about the
        session.
      </p>
      <div className="stack" style={gap('0.4rem')}>
        <p className="eyebrow">Recorded if you agree</p>
        <ul className="consent-list">
          <li>Each proposal you are shown, with the pay, hours and shifts it would mean for you</li>
          <li>Your yes or no to each one, and how long you took to answer</li>
          <li>Which priority you pick, such as take-home pay or time off</li>
        </ul>
      </div>
      <div className="stack" style={gap('0.4rem')}>
        <p className="eyebrow">Never recorded</p>
        <ul className="consent-list">
          <li>Your name or anyone else’s. Everyone becomes Person 1, Person 2 and so on.</li>
          <li>Your private limits, or anything else you set on the limits screen</li>
        </ul>
      </div>
      <p className="muted small">
        The records stay in this browser until the person running the session exports them. They
        may be used to study or train computer models of how people make decisions.
      </p>
      <div className="field" style={{ maxWidth: '18rem' }}>
        <label htmlFor="consent-code">Participant code (optional)</label>
        <input
          id="consent-code"
          type="text"
          maxLength={24}
          placeholder="e.g. P07"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <span className="muted small">A code you were given, never your name. Left empty, a random one is used.</span>
      </div>
      <div className="row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => onAnswer({ agreed: true, code: cleanCode(code) })}
        >
          Yes, record my answers
        </button>
        <button type="button" className="btn" onClick={() => onAnswer({ agreed: false, code: '' })}>
          No, don’t record mine
        </button>
      </div>
    </section>
  );
}
