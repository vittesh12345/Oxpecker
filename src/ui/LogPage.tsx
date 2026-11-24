import { useState } from 'react';
import { categoryLabels } from '../scenarios';
import { logStats, toCsv, type LogEntry } from '../session/log';
import { CopyButton, gap } from './bits';

interface Props {
  entries: LogEntry[];
  justSaved: boolean;
  onClear: () => void;
  onHome: () => void;
}

/** Set VITE_NO_DOWNLOADS=true when building for a host that blocks file downloads. */
const canDownload = import.meta.env.VITE_NO_DOWNLOADS !== 'true';

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

function downloadCsv(csv: string): void {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'oxpecker-practice-log.csv';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Every logged session on this device, with a summary and a CSV export. */
export function LogPage({ entries, justSaved, onClear, onHome }: Props) {
  const [confirming, setConfirming] = useState(false);
  const stats = logStats(entries);
  const csv = toCsv(entries);
  const newestFirst = [...entries].reverse();

  return (
    <>
      <div className="stack" style={gap('0.6rem')}>
        <p className="eyebrow">On this device only</p>
        <h1>Practice log</h1>
        <p className="lede">
          One line per finished session: which scenario, how it ended, how many rounds it took and
          how fair it felt. Limits and answers are never recorded.
        </p>
      </div>

      {justSaved && (
        <p className="notice" role="status">
          Session saved.
        </p>
      )}

      {entries.length === 0 ? (
        <section className="sheet stack">
          <h2>No sessions logged yet</h2>
          <p>
            Finish a session and save the short debrief at the end. It will show up here, ready to
            export as a spreadsheet.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={onHome}>
              Choose a scenario
            </button>
          </div>
        </section>
      ) : (
        <>
          <p className="num">
            {stats.sessions} {stats.sessions === 1 ? 'session' : 'sessions'} · {stats.agreements}{' '}
            ended in agreement ({Math.round((stats.agreementRate ?? 0) * 100)}%) ·{' '}
            {(stats.averageRounds ?? 0).toFixed(1)} rounds on average
            {stats.averageFairness !== null && ` · fairness ${stats.averageFairness.toFixed(1)} of 5`}
            {stats.participants > 0 &&
              ` · ${stats.participants} participant ${stats.participants === 1 ? 'code' : 'codes'}`}
          </p>

          <div className="sheet table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">Scenario</th>
                  <th scope="col">Type</th>
                  <th scope="col">Mode</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Rounds</th>
                  <th scope="col">Minutes</th>
                  <th scope="col">Fairness</th>
                  <th scope="col">Notes</th>
                </tr>
              </thead>
              <tbody>
                {newestFirst.map((entry) => (
                  <tr key={entry.id}>
                    <td>{dateTime.format(new Date(entry.at))}</td>
                    <td>{entry.participant || '—'}</td>
                    <td>
                      {entry.scenarioTitle}
                      {entry.customised && ' (own figures)'}
                    </td>
                    <td>{categoryLabels[entry.category]}</td>
                    <td>{entry.mode === 'solo' ? 'Solo' : 'Together'}</td>
                    <td>{entry.outcome === 'agreement' ? 'Agreement' : 'No deal'}</td>
                    <td className="num">{entry.rounds}</td>
                    <td className="num">{entry.minutes.toFixed(1)}</td>
                    <td className="num">{entry.fairness ?? '—'}</td>
                    <td className="notes">{entry.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row">
            {canDownload && (
              <button type="button" className="btn" onClick={() => downloadCsv(csv)}>
                Download CSV
              </button>
            )}
            <CopyButton id="log-csv" label="Copy as CSV" text={csv} />
            {confirming ? (
              <>
                <span>Delete all {entries.length} entries from this device?</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    onClear();
                    setConfirming(false);
                  }}
                >
                  Yes, delete them
                </button>
                <button type="button" className="btn btn-quiet" onClick={() => setConfirming(false)}>
                  Keep them
                </button>
              </>
            ) : (
              <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
                Clear the log
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}
