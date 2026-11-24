import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { describeChoices } from '../engine/engine';
import { formatDelta, formatValue, monthly } from '../engine/format';
import type { Choices, MetricSpec, Outcome, Scenario } from '../engine/types';

/** Sets the gap of a `.stack` without a one-off class. */
export const gap = (value: string) => ({ '--gap': value }) as CSSProperties;

/** Switches the page onto the envelope lining while a private screen is showing. */
export function usePrivateBackdrop(active: boolean): void {
  useEffect(() => {
    document.body.classList.toggle('is-private', active);
    return () => document.body.classList.remove('is-private');
  }, [active]);
}

/** The public terms of an arrangement as plain lines of text, for copying. */
export function termsText(scenario: Scenario, choices: Choices): string[] {
  return [
    ...describeChoices(scenario, choices).map((line) => `${line.label}: ${line.option}`),
    ...(scenario.derivedTerms?.(choices) ?? []),
  ];
}

export function Terms({ scenario, choices }: { scenario: Scenario; choices: Choices }) {
  const lines = describeChoices(scenario, choices);
  const derived = scenario.derivedTerms?.(choices) ?? [];
  return (
    <ul className="terms">
      {lines.map((line) => (
        <li key={line.issueId} className={line.changed ? 'changed' : 'same'}>
          <span className="term-label">{line.label}</span>
          <span className="term-option">
            {line.option}
            {!line.changed && ' (as today)'}
          </span>
        </li>
      ))}
      {derived.map((text) => (
        <li key={text} className="derived">
          <span className="term-option">{text}</span>
        </li>
      ))}
    </ul>
  );
}

interface FiguresProps {
  metrics: MetricSpec[];
  outcome: Outcome;
  /** When given, each figure also shows its change from this outcome. */
  against?: Outcome;
  recurring: boolean;
}

/** A person's projected numbers, pay-stub style: label left, figure right. */
export function Figures({ metrics, outcome, against, recurring }: FiguresProps) {
  return (
    <dl className="figures">
      {metrics.map((metric) => {
        const value = outcome.metrics[metric.key] ?? 0;
        const delta = against ? value - (against.metrics[metric.key] ?? 0) : 0;
        const changed = Math.abs(delta) >= 0.005;
        const tone =
          !changed || metric.better === 'neutral'
            ? 'flat'
            : (metric.better === 'higher') === delta > 0
              ? 'gain'
              : 'cost';
        const showMonth = recurring && (metric.key === 'weeklyPay' || metric.key === 'laborCost');
        return (
          <div key={metric.key}>
            <dt>{metric.label}</dt>
            <dd>
              <span className="value">{formatValue(metric.unit, value)}</span>
              {against && (
                <span className={`delta ${tone}`}>
                  {changed ? `${formatDelta(metric.unit, delta)} vs today` : 'no change'}
                </span>
              )}
              {showMonth && (
                <span className="per-month">about {formatValue('money', monthly(value))} a month</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function PrivateBanner({ name, solo }: { name: string; solo: boolean }) {
  return (
    <div className="private-banner" role="status">
      <strong>Private · {name}</strong>
      <span className="small">
        {solo
          ? 'Your limits stay on this device and are never shown to the other side.'
          : 'For your eyes only. Nothing on this screen is shown to anyone else.'}
      </span>
    </div>
  );
}

interface GateProps {
  name: string;
  purpose: string;
  onReveal: () => void;
}

/** Shown between turns on a shared device so nobody sees the previous person's screen. */
export function PrivacyGate({ name, purpose, onReveal }: GateProps) {
  return (
    <section className="sheet gate" aria-labelledby="gate-title">
      <p className="eyebrow">Private step</p>
      <h2 id="gate-title">Hand the device to {name}</h2>
      <p>{purpose} Everyone else, please look away until the device is handed on.</p>
      <button type="button" className="btn btn-primary" onClick={onReveal}>
        I’m {name}. Show my screen
      </button>
    </section>
  );
}

/** Copies text, falling back to a selected text box where the clipboard is unavailable. */
export function CopyButton({ text, label, id }: { text: string; label: string; id: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'manual'>('idle');
  const box = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status === 'manual') box.current?.select();
  }, [status]);

  const copy = () => {
    try {
      navigator.clipboard
        .writeText(text)
        .then(() => setStatus('copied'))
        .catch(() => setStatus('manual'));
    } catch {
      setStatus('manual');
    }
  };

  return (
    <>
      <button type="button" className="btn" onClick={copy}>
        {status === 'copied' ? 'Copied' : label}
      </button>
      {status === 'manual' && (
        <div className="field" style={{ flexBasis: '100%' }}>
          <label htmlFor={id}>Copying is blocked here. Select the text and copy it yourself:</label>
          <textarea id={id} ref={box} className="copy-fallback" readOnly value={text} />
        </div>
      )}
    </>
  );
}
