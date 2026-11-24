import { useMemo, useState } from 'react';
import { templateById } from './scenarios';
import {
  browserStore,
  clearLog,
  entryFrom,
  loadLog,
  saveLog,
  type Debrief,
  type LogEntry,
} from './session/log';
import { reduce, startSession, type Action, type SessionState } from './session/session';
import { Brief, type StartRequest } from './ui/Brief';
import { DebriefForm } from './ui/Debrief';
import { Home } from './ui/Home';
import { LogPage } from './ui/LogPage';
import { SessionView } from './ui/SessionView';

type View =
  | { name: 'home' }
  | { name: 'brief'; templateId: string }
  | { name: 'session' }
  | { name: 'debrief' }
  | { name: 'log'; justSaved: boolean };

export default function App() {
  const store = useMemo(browserStore, []);
  const [view, setView] = useState<View>({ name: 'home' });
  const [session, setSession] = useState<SessionState | null>(null);
  const [log, setLog] = useState<LogEntry[]>(() => loadLog(store));
  const [leaving, setLeaving] = useState(false);

  const go = (next: View) => {
    setView(next);
    setLeaving(false);
    window.scrollTo(0, 0);
  };
  const dispatch = (action: Action) => setSession((s) => (s ? reduce(s, action) : s));
  const inSession = (view.name === 'session' || view.name === 'debrief') && session !== null;

  const start = (templateId: string, request: StartRequest) => {
    setSession(
      startSession({
        templateId,
        scenario: request.scenario,
        mode: request.mode,
        soloRole: request.soloRole,
        customised: request.customised,
        seed: Date.now() % 2147483647,
      }),
    );
    go({ name: 'session' });
  };

  const saveDebrief = (debrief: Debrief) => {
    if (!session) return;
    const entries = [...log, entryFrom(session, debrief)];
    const saved = saveLog(store, entries);
    setLog(entries);
    setSession(null);
    go({ name: 'log', justSaved: saved });
  };

  const leave = () => {
    setSession(null);
    go({ name: 'home' });
  };

  return (
    <div className="shell">
      <header className="masthead">
        <button
          type="button"
          className="wordmark"
          aria-label="Oxpecker, home"
          onClick={() => (inSession ? setLeaving(true) : go({ name: 'home' }))}
        >
          Oxpecker
        </button>

        {inSession ? (
          <div className="session-tools">
            <span className="session-title">
              {session.scenario.title} · {session.mode === 'solo' ? 'solo practice' : 'together'}
            </span>
            {leaving ? (
              <>
                <span className="small">Leave? Nothing from this session is kept.</span>
                <button type="button" className="navlink" onClick={leave}>
                  Yes, leave
                </button>
                <button type="button" className="navlink" onClick={() => setLeaving(false)}>
                  Stay
                </button>
              </>
            ) : (
              <button type="button" className="navlink" onClick={() => setLeaving(true)}>
                Leave session
              </button>
            )}
          </div>
        ) : (
          <nav aria-label="Main">
            <button
              type="button"
              className="navlink"
              aria-current={view.name === 'home' || view.name === 'brief' ? 'page' : undefined}
              onClick={() => go({ name: 'home' })}
            >
              Scenarios
            </button>
            <button
              type="button"
              className="navlink"
              aria-current={view.name === 'log' ? 'page' : undefined}
              onClick={() => go({ name: 'log', justSaved: false })}
            >
              Practice log{log.length > 0 ? ` (${log.length})` : ''}
            </button>
          </nav>
        )}
      </header>

      <main>
        {view.name === 'home' && <Home onOpen={(templateId) => go({ name: 'brief', templateId })} />}

        {view.name === 'brief' && (
          <Brief
            key={view.templateId}
            template={templateById(view.templateId)}
            onBack={() => go({ name: 'home' })}
            onStart={(request) => start(view.templateId, request)}
          />
        )}

        {view.name === 'session' && session && (
          <SessionView state={session} dispatch={dispatch} onFinish={() => go({ name: 'debrief' })} />
        )}

        {view.name === 'debrief' && session && (
          <DebriefForm
            state={session}
            canSave={store !== null}
            onSave={saveDebrief}
            onSkip={leave}
          />
        )}

        {view.name === 'log' && (
          <LogPage
            entries={log}
            justSaved={view.justSaved}
            onHome={() => go({ name: 'home' })}
            onClear={() => {
              clearLog(store);
              setLog([]);
            }}
          />
        )}
      </main>

      <footer className="colophon">
        Oxpecker is a practice tool, not legal or financial advice. Pay figures are gross
        estimates. Everything you enter stays in this browser.
      </footer>
    </div>
  );
}
