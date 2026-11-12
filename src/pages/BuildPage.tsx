import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BuildDetail, Log, Tasks, TaskRunView } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Copy, Duration, ErrorBox, Field, Head12, Loaded, RefreshButton, StatusBadge, Time } from "../components/ui";

const observationText: Record<string, string> = {
  not_found: "Tekton no longer has this PipelineRun (pruned), or has not created it yet.",
  unavailable: "Tekton could not be read right now.",
};

function seconds(a: string | null, b: string | null): number | null {
  return a && b ? (Date.parse(b) - Date.parse(a)) / 1000 : null;
}

export function BuildPage() {
  const { appId = "", buildId = "" } = useParams();
  const b = useResource<BuildDetail>(`/api/v1/builds/${encodeURIComponent(buildId)}`, { pollWhile: (d) => running(d.status) });
  return (
    <main>
      <p className="crumbs">
        <Link to={`/applications/${appId}/builds`}>← Builds</Link>
      </p>
      <Loaded resource={b}>
        {(d) => (
          <>
            <div className="page-head">
              <h1>
                Build <Head12 revision={d.sourceRevision} head12={d.head12} /> <StatusBadge status={d.status} />
              </h1>
              <RefreshButton resource={b} />
            </div>
            {/* Application -> DeliveryRun -> BUILD_APPLICATION step -> Build -> PipelineRun */}
            <ol className="chain" aria-label="Correlation">
              <li>
                <Link to={`/applications/${appId}/general`}>Application</Link>
              </li>
              <li>
                <Link to={`/applications/${appId}/deliveries/${d.deliveryRunId}`}>
                  Delivery run <Head12 revision={d.sourceRevision} head12={d.head12} />
                </Link>
              </li>
              <li>
                Build application step <code className="small">{d.deliveryStepId.slice(0, 8)}</code>
              </li>
              <li>
                Build <code className="small">{d.id.slice(0, 8)}</code>
              </li>
              <li>
                PipelineRun <code className="small">{d.pipelineRun.namespace}/{d.pipelineRun.name}</code>
              </li>
            </ol>
            <div className="grid">
              <dl className="panel">
                <h2>Build</h2>
                <Field label="Source revision">
                  <Copy text={d.sourceRevision} />
                </Field>
                <Field label="Started">
                  <Time at={d.startedAt} />
                </Field>
                <Field label="Completed">
                  <Time at={d.completedAt} />
                </Field>
                <Field label="Duration">
                  <Duration seconds={d.durationSeconds} />
                </Field>
                <Field label="Trigger event">
                  <code className="small">{d.triggerEventId ?? "—"}</code>
                </Field>
                {d.sanitizedError && (
                  <Field label="Error">
                    <span className="error-text">{d.sanitizedError}</span>
                  </Field>
                )}
                <Field label="Image">
                  {d.image ? (
                    <>
                      <Copy text={d.image.reference} />
                      <br />
                      <Copy text={d.image.digest} />
                    </>
                  ) : (
                    <span className="muted">no image</span>
                  )}
                </Field>
              </dl>
              <dl className="panel">
                <h2>PipelineRun (Tekton)</h2>
                {d.pipelineRunStatus ? (
                  <>
                    <Field label="Status">
                      <StatusBadge status={d.pipelineRunStatus.status} label={d.pipelineRunStatus.reason || d.pipelineRunStatus.status} />
                    </Field>
                    {d.pipelineRunStatus.message && <Field label="Message">{d.pipelineRunStatus.message}</Field>}
                    <Field label="Started">
                      <Time at={d.pipelineRunStatus.startTime} />
                    </Field>
                    <Field label="Completed">
                      <Time at={d.pipelineRunStatus.completionTime} />
                    </Field>
                    <Field label="Results">
                      {d.pipelineRunStatus.results.length === 0 ? (
                        <span className="muted">none</span>
                      ) : (
                        <ul className="plain">
                          {d.pipelineRunStatus.results.map((r) => (
                            <li key={r.name}>
                              <span className="muted">{r.name}</span> <code className="small">{r.value}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Field>
                  </>
                ) : (
                  <p className="muted">{observationText[d.observation] ?? d.observation}</p>
                )}
              </dl>
            </div>
            <TaskRuns buildId={d.id} buildRunning={running(d.status)} />
          </>
        )}
      </Loaded>
    </main>
  );
}

function TaskRuns({ buildId, buildRunning }: { buildId: string; buildRunning: boolean }) {
  const t = useResource<Tasks>(`/api/v1/builds/${encodeURIComponent(buildId)}/tasks`, { pollWhile: () => buildRunning });
  return (
    <section aria-label="TaskRuns">
      <h2>TaskRuns</h2>
      <Loaded resource={t}>
        {(d) =>
          d.observation !== "observed" ? (
            <p className="muted">{observationText[d.observation] ?? d.observation}</p>
          ) : d.taskRuns.length === 0 ? (
            <p className="muted empty">No TaskRun yet.</p>
          ) : (
            d.taskRuns.map((tr) => <TaskRun key={tr.name} buildId={buildId} tr={tr} />)
          )
        }
      </Loaded>
    </section>
  );
}

function TaskRun({ buildId, tr }: { buildId: string; tr: TaskRunView }) {
  const [log, setLog] = useState<string | null>(null);
  return (
    <div className="panel taskrun">
      <h3>
        {tr.pipelineTask} <StatusBadge status={tr.status} label={tr.reason || tr.status || tr.observation} />{" "}
        <span className="muted small">
          {tr.task && <>task {tr.task} · </>}
          <code>{tr.name}</code> · <Duration seconds={seconds(tr.startTime, tr.completionTime)} />
        </span>
      </h3>
      {tr.message && <p className="muted small">{tr.message}</p>}
      <table className="list">
        <thead>
          <tr>
            <th>Step</th>
            <th>State</th>
            <th>Exit code</th>
            <th>Duration</th>
            <th>Log</th>
          </tr>
        </thead>
        <tbody>
          {tr.steps.map((s) => (
            <tr key={s.name}>
              <td>{s.name}</td>
              <td>
                <StatusBadge status={s.exitCode === null ? s.state : s.exitCode === 0 ? "SUCCEEDED" : "FAILED"} label={s.reason || s.state} />
              </td>
              <td>{s.exitCode ?? "—"}</td>
              <td>
                <Duration seconds={seconds(s.startedAt, s.finishedAt)} />
              </td>
              <td>
                <button type="button" className="link-button" onClick={() => setLog(log === s.name ? null : s.name)}>
                  {log === s.name ? "hide" : "view log"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {log && <LogViewer buildId={buildId} taskRun={tr.name} step={log} />}
      {tr.results.length > 0 && (
        <p className="small">
          Results:{" "}
          {tr.results.map((r) => (
            <span key={r.name} className="result">
              {r.name}=<code>{r.value}</code>{" "}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

// LogViewer shows one step's log as the Tenant CP bounds it: the last lines,
// marked when truncated. Not streamed (Decision 0060 §11).
export function LogViewer({ buildId, taskRun, step }: { buildId: string; taskRun: string; step: string }) {
  const r = useResource<Log>(
    `/api/v1/builds/${encodeURIComponent(buildId)}/tasks/${encodeURIComponent(taskRun)}/logs?step=${encodeURIComponent(step)}`,
  );
  if (r.error) return <ErrorBox error={r.error} />;
  if (!r.data) return <p className="muted" role="status">Loading the log…</p>;
  return (
    <div className="log" aria-label={`Log of ${step}`}>
      {r.data.truncated && (
        <p className="muted small">
          Truncated: the last {r.data.tailLines} lines, at most {Math.round(r.data.limitBytes / 1024)} KiB.
        </p>
      )}
      <pre>{r.data.content || "(empty)"}</pre>
    </div>
  );
}
