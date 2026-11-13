import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BuildDetail, Log, Tasks, TaskRunView } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Copy, Duration, ErrorBox, Field, Head12, Loaded, RefreshButton, StatusBadge, Time, newestFirst } from "../components/ui";

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
                <PipelineRunFields build={d} />
              </dl>
            </div>
            <TaskRuns buildId={d.id} buildRunning={running(d.status)} />
          </>
        )}
      </Loaded>
    </main>
  );
}

// PipelineRunFields is what Tekton reports of a build's PipelineRun, or why
// it cannot be read.
export function PipelineRunFields({ build }: { build: BuildDetail }) {
  const pr = build.pipelineRunStatus;
  if (!pr) return <p className="muted">{observationText[build.observation] ?? build.observation}</p>;
  return (
    <>
      <Field label="Status">
        <StatusBadge status={pr.status} label={pr.reason || pr.status} />
      </Field>
      {pr.message && <Field label="Message">{pr.message}</Field>}
      <Field label="Started">
        <Time at={pr.startTime} />
      </Field>
      <Field label="Completed">
        <Time at={pr.completionTime} />
      </Field>
      <Field label="Results">
        {pr.results.length === 0 ? (
          <span className="muted">none</span>
        ) : (
          <ul className="plain">
            {pr.results.map((r) => (
              <li key={r.name}>
                <span className="muted">{r.name}</span> <code className="small">{r.value}</code>
              </li>
            ))}
          </ul>
        )}
      </Field>
    </>
  );
}

function TaskRuns({ buildId, buildRunning }: { buildId: string; buildRunning: boolean }) {
  return (
    <section aria-label="TaskRuns">
      <h2>TaskRuns</h2>
      <TaskRunList buildId={buildId} buildRunning={buildRunning} />
    </section>
  );
}

// TaskRunList is a build's TaskRuns with their steps. One step's log is open
// at a time, in a row under that step.
export function TaskRunList({ buildId, buildRunning }: { buildId: string; buildRunning: boolean }) {
  const t = useResource<Tasks>(`/api/v1/builds/${encodeURIComponent(buildId)}/tasks`, { pollWhile: () => buildRunning });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Loaded resource={t}>
      {(d) =>
        d.observation !== "observed" ? (
          <p className="muted">{observationText[d.observation] ?? d.observation}</p>
        ) : d.taskRuns.length === 0 ? (
          <p className="muted empty">No TaskRun yet.</p>
        ) : (
          <ul className="plain" aria-label="TaskRun list">
            {newestFirst(d.taskRuns).map((tr) => (
              <li key={tr.name}>
                <TaskRun buildId={buildId} tr={tr} open={open} onLog={(key) => setOpen(open === key ? null : key)} />
              </li>
            ))}
          </ul>
        )
      }
    </Loaded>
  );
}

function TaskRun({ buildId, tr, open, onLog }: { buildId: string; tr: TaskRunView; open: string | null; onLog: (key: string) => void }) {
  return (
    <div className="panel taskrun" aria-label={`TaskRun ${tr.pipelineTask}`}>
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
          {newestFirst(tr.steps).map((s) => {
            const key = `${tr.name}/${s.name}`;
            return (
              <Fragment key={s.name}>
                <tr>
                  <td>{s.name}</td>
                  <td>
                    <StatusBadge status={s.exitCode === null ? s.state : s.exitCode === 0 ? "SUCCEEDED" : "FAILED"} label={s.reason || s.state} />
                  </td>
                  <td>{s.exitCode ?? "—"}</td>
                  <td>
                    <Duration seconds={seconds(s.startedAt, s.finishedAt)} />
                  </td>
                  <td>
                    <button type="button" className="link-button" aria-expanded={open === key} onClick={() => onLog(key)}>
                      {open === key ? "hide log" : "view log"}
                    </button>
                  </td>
                </tr>
                {open === key && (
                  <tr className="step-log">
                    <td colSpan={5}>
                      <LogViewer buildId={buildId} taskRun={tr.name} step={s.name} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
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
