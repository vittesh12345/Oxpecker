import { useEffect, useState } from 'react';
import { baselineOf, countFitting, relaxTo } from '../engine/engine';
import { formatValue, round2 } from '../engine/format';
import type {
  AvailabilityLimitSpec,
  LimitValues,
  NumericLimitSpec,
  Party,
} from '../engine/types';
import type { Nudge, SessionState } from '../session/session';
import { Figures, gap } from './bits';

interface Props {
  state: SessionState;
  party: Party;
  onLock: (values: LimitValues, pref: string) => void;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function NumericLimit({
  spec,
  value,
  today,
  onChange,
}: {
  spec: NumericLimitSpec;
  value: number | null;
  today: number;
  onChange: (value: number | null) => void;
}) {
  const on = value !== null;
  const [draft, setDraft] = useState(on ? String(value) : '');

  // Keep the typed figure in step when the slider or a hint changes the value.
  useEffect(() => {
    if (value === null) setDraft('');
    else if (Number(draft) !== value) setDraft(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const startingPoint = clamp(relaxTo(spec, today), spec.lo, spec.hi);
  const brokenToday =
    on && (spec.kind === 'min' ? today < value - 0.005 : today > value + 0.005);
  const prefix = spec.unit === 'money' || spec.unit === 'rate' ? '$' : '';
  const suffix = spec.unit === 'rate' ? '/hr' : spec.unit === 'hours' ? 'h' : '';

  return (
    <div className="limit">
      <label className="option limit-head">
        <input
          type="checkbox"
          id={`limit-${spec.id}-on`}
          checked={on}
          onChange={(event) => onChange(event.target.checked ? startingPoint : null)}
        />
        <span>{spec.label}</span>
      </label>
      {on && (
        <div className="limit-controls">
          <input
            type="range"
            id={`limit-${spec.id}-range`}
            aria-label={spec.label}
            min={spec.lo}
            max={spec.hi}
            step={spec.step}
            value={clamp(value, spec.lo, spec.hi)}
            onChange={(event) => onChange(round2(Number(event.target.value)))}
          />
          <span className="unit-field">
            {prefix}
            <input
              type="number"
              id={`limit-${spec.id}`}
              aria-label={`${spec.label}, exact figure`}
              inputMode="decimal"
              min={0}
              step={spec.step}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                const typed = Number(event.target.value);
                if (event.target.value.trim() !== '' && Number.isFinite(typed) && typed >= 0) {
                  onChange(round2(typed));
                }
              }}
            />
            {suffix}
          </span>
        </div>
      )}
      <p className="limit-note">
        Today: <span className="num">{formatValue(spec.unit, today)}</span>
        {brokenToday && <span className="broken"> · already outside this limit</span>}
        {!on && ' · no limit set'}
      </p>
    </div>
  );
}

function AvailabilityLimit({
  spec,
  value,
  today,
  slotLabel,
  onChange,
}: {
  spec: AvailabilityLimitSpec;
  value: string[];
  today: string[];
  slotLabel: (id: string) => string;
  onChange: (value: string[]) => void;
}) {
  return (
    <div className="limit">
      <p className="limit-head">{spec.label}</p>
      <div className="chips" role="group" aria-label={spec.label}>
        {spec.slots.map((slot) => {
          const blocked = value.includes(slot);
          return (
            <button
              key={slot}
              type="button"
              className="chip"
              aria-pressed={blocked}
              onClick={() =>
                onChange(blocked ? value.filter((s) => s !== slot) : [...value, slot])
              }
            >
              {slotLabel(slot)}
              {today.includes(slot) ? ' · yours today' : ''}
            </button>
          );
        })}
      </div>
      <p className="muted small">
        {value.length === 0
          ? 'Nothing ruled out. Tap any shift you cannot work.'
          : 'Highlighted shifts will never be proposed for you.'}
      </p>
    </div>
  );
}

function NudgePanel({
  state,
  party,
  values,
  onApply,
}: {
  state: SessionState;
  party: Party;
  values: LimitValues;
  onApply: (nudge: Nudge) => void;
}) {
  const revision = state.revision;
  if (!revision) return null;

  if (revision.reason === 'rethink') {
    return (
      <p className="notice">
        Take another look at your limits. Proposals that were turned down can come back if they
        still fit everyone.
      </p>
    );
  }
  if (!revision.nearMissFound) {
    return (
      <p className="notice notice-warn">
        Every possible arrangement runs into somebody’s availability. Check whether any shift you
        ruled out could work after all.
      </p>
    );
  }

  const nudges = revision.nudges[party.id] ?? [];
  if (nudges.length === 0) {
    return (
      <p className="notice">
        Your limits are not what is blocking the closest arrangement. Leave them as they are, or
        loosen one if you want to open up more options.
        {state.othersMoved && ' The other side has moved a little.'}
      </p>
    );
  }

  return (
    <div className="notice notice-warn stack" style={gap('0.75rem')}>
      <p>
        <strong>The closest arrangement falls just outside your limits.</strong> Move a limit only
        if you can truly live with it. If you can’t, leave it where it is: that is what limits are
        for.
      </p>
      {nudges.map((nudge) => {
        const spec = party.limits.find((l) => l.id === nudge.limitId) as NumericLimitSpec;
        const current = values[spec.id];
        const moved =
          typeof current !== 'number' ||
          (spec.kind === 'min' ? current <= nudge.actual + 0.005 : current >= nudge.actual - 0.005);
        return (
          <div key={nudge.limitId} className="row">
            <span>
              {spec.label}: it would give you{' '}
              <strong className="num">{formatValue(spec.unit, nudge.actual)}</strong>.
            </span>
            <button type="button" className="btn" disabled={moved} onClick={() => onApply(nudge)}>
              {moved ? 'Limit moved' : `Move my limit to ${formatValue(spec.unit, nudge.relaxedValue)}`}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** One person's private screen for setting limits on pay, hours and availability. */
export function LimitsStep({ state, party, onLock }: Props) {
  const { scenario } = state;
  const [values, setValues] = useState<LimitValues>(() => state.limits[party.id]);
  const [pref, setPref] = useState(state.prefs[party.id]);

  const today = baselineOf(scenario).outcomes[party.id];
  const fit = countFitting(scenario, party.id, values);
  const slotLabel = (id: string) => scenario.slots.find((s) => s.id === id)?.label ?? id;
  const set = (id: string, value: LimitValues[string]) => setValues((v) => ({ ...v, [id]: value }));

  return (
    <div className="limits-layout">
      <section className="sheet stack" aria-labelledby="limits-title">
        <div className="stack" style={gap('0.5rem')}>
          <h2 id="limits-title">{party.name}, set your limits</h2>
          <p>{party.privateBrief}</p>
          <p className="muted small">
            The figures below are a starting point for practice. Change them to what you would
            actually hold to.
          </p>
        </div>

        <NudgePanel
          state={state}
          party={party}
          values={values}
          onApply={(nudge) => set(nudge.limitId, nudge.relaxedValue)}
        />

        <div>
          {party.limits.map((spec) =>
            spec.kind === 'unavailable' ? (
              <AvailabilityLimit
                key={spec.id}
                spec={spec}
                value={Array.isArray(values[spec.id]) ? (values[spec.id] as string[]) : []}
                today={today.shifts}
                slotLabel={slotLabel}
                onChange={(next) => set(spec.id, next)}
              />
            ) : (
              <NumericLimit
                key={spec.id}
                spec={spec}
                value={typeof values[spec.id] === 'number' ? (values[spec.id] as number) : null}
                today={today.metrics[spec.metric] ?? 0}
                onChange={(next) => set(spec.id, next)}
              />
            ),
          )}
        </div>

        {party.priorities.length > 1 && (
          <fieldset className="stack" style={{ ...gap('0.5rem'), border: 0, padding: 0, margin: 0 }}>
            <legend className="limit-head" style={{ padding: 0, marginBottom: '0.5rem' }}>
              When more than one option fits, what matters most to you?
            </legend>
            {party.priorities.map((priority) => (
              <label key={priority.id} className="option">
                <input
                  type="radio"
                  name="priority"
                  id={`priority-${priority.id}`}
                  checked={pref === priority.id}
                  onChange={() => setPref(priority.id)}
                />
                <span>{priority.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        <p className={fit.fit === 0 ? 'notice notice-warn' : 'notice'} role="status">
          {fit.fit === 0 ? (
            <>
              Nothing on the table is inside your limits, so nothing can be proposed. Loosen at
              least one to continue.
            </>
          ) : (
            <>
              <strong className="num">
                {fit.fit} of {fit.total}
              </strong>{' '}
              possible arrangements are inside your limits. This count uses only your own limits.
            </>
          )}
        </p>

        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={fit.fit === 0}
            onClick={() => onLock(values, pref)}
          >
            {state.mode === 'together' ? 'Lock in and hide my limits' : 'Lock in my limits'}
          </button>
        </div>
      </section>

      <aside className="sheet stack" aria-labelledby="today-title">
        <h3 id="today-title">How things stand today</h3>
        <Figures metrics={party.metrics} outcome={today} recurring={scenario.recurring} />
        {scenario.slots.length > 0 && (
          <div className="stack" style={gap('0.3rem')}>
            <p className="eyebrow">Your shifts today</p>
            <p>{today.shifts.length ? today.shifts.map(slotLabel).join(' · ') : 'None of the shifts in question'}</p>
          </div>
        )}
        <p className="muted small">Pay figures are gross, before tax and deductions.</p>
      </aside>
    </div>
  );
}
