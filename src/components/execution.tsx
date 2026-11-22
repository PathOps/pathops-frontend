import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { Failure, FluxExecution, FluxObject, Log, RefSource, TaskRunRecord, TektonExecution } from "../api/types";
import { useResource } from "../api/useResource";
import { Copy, CopyButton, Duration, ErrorBox, Fact, Facts, Short, Status, Time, humanize, newestFirst, seconds, title } from "./ui";

// FailureText is a run's, step's or Deployment's failure: its reason, in
// words, and its message.
export function FailureText({ failure }: { failure: Failure }) {
  return (
    <span className="error">
      {humanize(failure.reason)}
      {failure.message ? `: ${failure.message}` : ""}
    </span>
  );
}

// RefSourceText is where Tekton resolved a definition from: its revision
// (and entry point), as Tekton reported it.
export function RefSourceText({ source }: { source: RefSource | null }) {
  const sha = source?.digest?.sha1;
  if (!source || !sha) return <span className="muted">not reported</span>;
  return (
    <>
      <Copy text={sha}>
        <Short text={sha} />
      </Copy>
      {source.entryPoint && (
        <>
          {" "}
          <small className="muted">{source.entryPoint}</small>
        </>
      )}
    </>
  );
}

// LogPath is the API path of one step's log of one TaskRun.
export type LogPath = (taskRun: string, step: string) => string;

// TektonExecutionView is a Tekton Execution as PathOps recorded it:
// PipelineRun -> TaskRuns -> Steps, each step's log read live (one open at a
// time). Nothing here reads Tekton: the history stays after a prune; only a
// log may be gone.
export function TektonExecutionView({ x, logPath }: { x: TektonExecution; logPath: LogPath }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <Facts label="PipelineRun">
        <Fact label="PipelineRun">
          <code>
            {x.pipelineRun.namespace}/{x.pipelineRun.name}
          </code>
        </Fact>
        <Fact label="Status">
          <Status status={x.status} label={x.reason || x.status} />
        </Fact>
        {x.message && <Fact label="Message">{x.message}</Fact>}
        <Fact label="Started">
          <Time at={x.startedAt} />
        </Fact>
        <Fact label="Completed">
          <Time at={x.completedAt} />
        </Fact>
        <Fact label="Duration">
          <Duration seconds={seconds(x.startedAt, x.completedAt)} />
        </Fact>
        <Fact label="Resolved from">
          <RefSourceText source={x.refSource} />
        </Fact>
        <Fact label="Trigger event">{x.triggerEventId ?? <span className="muted">—</span>}</Fact>
        {x.results.map((r) => (
          <Fact key={r.name} label={title(r.name)}>
            <code>{r.value}</code>
          </Fact>
        ))}
      </Facts>
      <section aria-label="TaskRuns">
        <h3>TaskRuns</h3>
        {x.taskRuns.length === 0 ? (
          <p className="muted">No TaskRun yet.</p>
        ) : (
          newestFirst(x.taskRuns).map((tr) => (
            <TaskRun key={tr.name} tr={tr} logPath={logPath} open={open} onLog={(key) => setOpen(open === key ? null : key)} />
          ))
        )}
      </section>
    </>
  );
}

function TaskRun({ tr, logPath, open, onLog }: { tr: TaskRunRecord; logPath: LogPath; open: string | null; onLog: (key: string) => void }) {
  return (
    <div aria-label={`TaskRun ${tr.pipelineTask}`} role="group">
      <h4>
        {tr.pipelineTask} — {tr.observedAt ? <Status status={tr.status} label={tr.reason || tr.status} /> : <span className="muted">not observed</span>}
      </h4>
      <Facts label={`TaskRun ${tr.pipelineTask} facts`}>
        <Fact label="TaskRun">
          <code>{tr.name}</code>
        </Fact>
        {tr.task && <Fact label="Task">{tr.task}</Fact>}
        <Fact label="Started">
          <Time at={tr.startedAt} />
        </Fact>
        <Fact label="Duration">
          <Duration seconds={seconds(tr.startedAt, tr.completedAt)} />
        </Fact>
        {tr.message && <Fact label="Message">{tr.message}</Fact>}
      </Facts>
      {tr.steps.length > 0 && (
        <div className="scroll">
          <table aria-label={`Steps of ${tr.pipelineTask}`}>
            <thead>
              <tr>
                <th>#</th>
                <th>Step</th>
                <th>State</th>
                <th>Exit code</th>
                <th>Duration</th>
                <th>Log</th>
              </tr>
            </thead>
            <tbody>
              {newestFirst(tr.steps.map((s, i) => ({ ...s, order: i + 1 }))).map((s) => {
                const key = `${tr.name}/${s.name}`;
                return (
                  <Fragment key={s.name}>
                    <tr>
                      <td>{s.order}</td>
                      <td>{s.name}</td>
                      <td>
                        <Status status={s.exitCode === null ? s.state : s.exitCode === 0 ? "SUCCEEDED" : "FAILED"} label={s.reason || s.state} />
                      </td>
                      <td>{s.exitCode ?? "—"}</td>
                      <td>
                        <Duration seconds={seconds(s.startedAt, s.finishedAt)} />
                      </td>
                      <td>
                        <button type="button" aria-expanded={open === key} onClick={() => onLog(key)}>
                          {open === key ? "Hide log" : "View log"}
                        </button>
                      </td>
                    </tr>
                    {open === key && (
                      <tr className="log-row">
                        <td colSpan={6}>
                          <LogViewer path={logPath(tr.name, s.name)} taskRun={tr.name} step={s.name} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// DownloadButton saves text as a file, made in the browser (nothing is
// fetched again).
function DownloadButton({ text, filename }: { text: string; filename: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      ⤓ Download
    </button>
  );
}

// LogViewer shows one step's log as the Tenant CP bounds it: the last lines,
// marked when truncated, scrolled to its end (what happened last). Read live
// and never persisted (Decision 0066 §5): once Tekton pruned it, it is gone.
export function LogViewer({ path, taskRun, step }: { path: string; taskRun: string; step: string }) {
  const r = useResource<Log>(path);
  const pre = useRef<HTMLPreElement>(null);
  const content = r.data?.content;
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [content]);
  if (r.error) {
    if (r.error instanceof ApiError && r.error.status === 404)
      return <p className="muted">The log is no longer available: Tekton removed this step's Pod (logs are not kept).</p>;
    return <ErrorBox error={r.error} />;
  }
  if (!r.data) return <p className="muted" role="status">Loading the log…</p>;
  return (
    <div aria-label={`Log of ${step}`} role="log">
      {r.data.truncated && (
        <p>
          <small>
            Truncated: the last {r.data.tailLines} lines, at most {Math.round(r.data.limitBytes / 1024)} KiB.
          </small>
        </p>
      )}
      {/* The actions float over the log's top right corner, outside its
          scroll, so they stay put while it scrolls. */}
      <div className="log-box">
        <pre ref={pre}>{r.data.content || "(empty)"}</pre>
        <div className="log-actions">
          <CopyButton text={r.data.content} label={`log of ${step}`} />
          <DownloadButton text={r.data.content} filename={`${taskRun}-${step}.log`} />
        </div>
      </div>
    </div>
  );
}

// Revision is a Flux revision (main@sha1:<sha>) as its commit's first 12
// characters, the whole revision on hover.
function Revision({ rev }: { rev?: string }) {
  if (!rev) return <span className="muted">—</span>;
  const sha = rev.slice(rev.lastIndexOf(":") + 1);
  return <code title={rev}>{sha.slice(0, 12)}</code>;
}

function FluxRow({ kind, o }: { kind: string; o: FluxObject | null }) {
  if (!o)
    return (
      <tr>
        <td>{kind}</td>
        <td colSpan={6} className="muted">
          not observed
        </td>
      </tr>
    );
  if (!o.found)
    return (
      <tr>
        <td>{kind}</td>
        <td>
          <code>{o.name}</code>
        </td>
        <td colSpan={4} className="muted">
          did not exist
        </td>
        <td>
          <Time at={o.observedAt} />
        </td>
      </tr>
    );
  return (
    <tr>
      <td>{kind}</td>
      <td>
        <code>{o.name}</code>
      </td>
      <td>
        {kind === "GitRepository" ? (
          <Revision rev={o.artifactRevision} />
        ) : (
          <>
            <Revision rev={o.lastAttemptedRevision} /> / <Revision rev={o.lastAppliedRevision} />
          </>
        )}
      </td>
      <td>
        {o.observedGeneration ?? "—"} / {o.generation ?? "—"}
      </td>
      <td>{o.ready ? <Status status={o.ready.status === "True" ? "SUCCEEDED" : o.ready.status === "False" ? "FAILED" : "RUNNING"} label={o.ready.reason || o.ready.status} /> : "—"}</td>
      <td>{o.ready?.message ?? "—"}</td>
      <td>
        <Time at={o.observedAt} />
      </td>
    </tr>
  );
}

// FluxExecutionView is a Flux Execution as PathOps recorded it: the source
// revision Flux had when it started and the last observed state of its
// GitRepository and Kustomization.
export function FluxExecutionView({ x }: { x: FluxExecution }) {
  return (
    <>
      <Facts label="Flux execution">
        <Fact label="Status">
          <Status status={x.status} label={x.reason ? humanize(x.reason) : undefined} />
        </Fact>
        {x.message && <Fact label="Message">{x.message}</Fact>}
        <Fact label="Namespace">
          <code>{x.namespace}</code>
        </Fact>
        <Fact label="Baseline revision">
          {x.baselineRevision ? (
            <Copy text={x.baselineRevision}>
              <Short text={x.baselineRevision} />
            </Copy>
          ) : (
            <span className="muted">—</span>
          )}
        </Fact>
        <Fact label="Started">
          <Time at={x.startedAt} />
        </Fact>
        <Fact label="Completed">
          <Time at={x.completedAt} />
        </Fact>
        <Fact label="Last observed">
          <Time at={x.observedAt} />
        </Fact>
      </Facts>
      <div className="scroll">
        <table aria-label="Flux objects">
          <thead>
            <tr>
              <th>Object</th>
              <th>Name</th>
              <th>Revision</th>
              <th>Generation</th>
              <th>Ready</th>
              <th>Message</th>
              <th>Observed</th>
            </tr>
          </thead>
          <tbody>
            <FluxRow kind="GitRepository" o={x.gitRepository} />
            <FluxRow kind="Kustomization" o={x.kustomization} />
          </tbody>
        </table>
      </div>
    </>
  );
}
