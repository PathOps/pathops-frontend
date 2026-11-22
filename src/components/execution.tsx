import { Fragment, useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";
import type { Failure, FluxExecution, FluxObject, Log, RefSource, TaskRunRecord, TektonExecution } from "../api/types";
import { useResource } from "../api/useResource";
import { Copy, CopyButton, Duration, ErrorBox, Fact, Facts, Short, Status, Time, humanize, newestFirst, seconds, title } from "./ui";

// The presentation of an Execution (Decision 0066 §4-§5): what the engine
// reported, never PathOps' verdict (the step's) nor its accepted facts (the
// projection's). Tekton and Flux share the generic Execution facts; below
// them each has its own.

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

// Sha12 is a commit SHA as its first 12 characters, the whole on hover.
export function Sha12({ sha }: { sha?: string }) {
  if (!sha) return <span className="muted">—</span>;
  return <code title={sha}>{sha.slice(0, 12)}</code>;
}

// FullSha is a commit SHA shortened, the whole on hover and copy.
export function FullSha({ sha, missing = "not yet" }: { sha?: string; missing?: string }) {
  if (!sha) return <span className="muted">{missing}</span>;
  return (
    <Copy text={sha}>
      <Short text={sha} />
    </Copy>
  );
}

// RefSourceText is where Tekton resolved a definition from: its revision
// (and entry point), as Tekton reported it.
export function RefSourceText({ source }: { source: RefSource | null }) {
  const sha = source?.digest?.sha1;
  if (!source || !sha) return <span className="muted">not reported</span>;
  return (
    <>
      <FullSha sha={sha} />
      {source.entryPoint && (
        <>
          {" "}
          <small className="muted">{source.entryPoint}</small>
        </>
      )}
    </>
  );
}

// executorName is an executor in words.
export function executorName(executor: string): string {
  return executor === "TEKTON" ? "Tekton" : executor === "FLUX" ? "Flux" : humanize(executor);
}

// ExecutionFacts are an Execution's generic facts: who executed it and what
// it reported (Decision 0066 §4).
export function ExecutionFacts({ x }: { x: TektonExecution | FluxExecution }) {
  return (
    <Facts label="Execution">
      <Fact label="Executor">{executorName(x.executor)}</Fact>
      <Fact label="Status">
        <Status status={x.status} />
      </Fact>
      <Fact label="Started">
        <Time at={x.startedAt} />
      </Fact>
      <Fact label="Completed">
        <Time at={x.completedAt} />
      </Fact>
      <Fact label="Duration">
        <Duration seconds={seconds(x.startedAt, x.completedAt)} />
      </Fact>
      <Fact label="Reason">{x.reason ? x.reason : <span className="muted">—</span>}</Fact>
      <Fact label="Message">{x.message ? <span className="wrap">{x.message}</span> : <span className="muted">—</span>}</Fact>
    </Facts>
  );
}

// PipelineRunFacts are what is Tekton's own of a Tekton Execution: the
// PipelineRun, where Tekton resolved it from, its trigger and its results
// (its status and times are the Execution's).
export function PipelineRunFacts({ x }: { x: TektonExecution }) {
  return (
    <Facts label="PipelineRun">
      <Fact label="PipelineRun">
        <code>
          {x.pipelineRun.namespace}/{x.pipelineRun.name}
        </code>
      </Fact>
      {x.pipelineRun.uid && (
        <Fact label="UID">
          <code>{x.pipelineRun.uid}</code>
        </Fact>
      )}
      <Fact label="Resolved from">
        <RefSourceText source={x.refSource} />
      </Fact>
      <Fact label="Trigger event">{x.triggerEventId ?? <span className="muted">—</span>}</Fact>
      <Fact label="Triggered">
        <Time at={x.triggeredAt} />
      </Fact>
      {x.results.map((r) => (
        <Fact key={r.name} label={title(r.name)}>
          <code>{r.value}</code>
        </Fact>
      ))}
    </Facts>
  );
}

// LogPath is the API path of one step's log of one TaskRun.
export type LogPath = (taskRun: string, step: string) => string;

// TektonStepsTable are a TaskRun's steps, numbered in execution order, latest
// first, each with its log (read live) in the row under it when open.
export function TektonStepsTable({
  tr,
  logPath,
  open,
  onLog,
}: {
  tr: TaskRunRecord;
  logPath: LogPath;
  open: string | null;
  onLog: (key: string) => void;
}) {
  if (tr.steps.length === 0) return <p className="muted">No step yet.</p>;
  return (
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
  );
}

// TaskRunsDetail are a Tekton Execution's TaskRuns, latest first, each with
// its facts and its steps (one log open at a time).
export function TaskRunsDetail({ x, logPath }: { x: TektonExecution; logPath: LogPath }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section aria-label="TaskRuns">
      <h2>TaskRuns</h2>
      {x.taskRuns.length === 0 ? (
        <p className="muted">No TaskRun yet.</p>
      ) : (
        newestFirst(x.taskRuns).map((tr) => (
          <div key={tr.name} aria-label={`TaskRun ${tr.pipelineTask}`} role="group">
            <h3>
              {tr.pipelineTask} — {tr.observedAt ? <Status status={tr.status} label={tr.reason || tr.status} /> : <span className="muted">not observed</span>}
            </h3>
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
              {tr.refSource && (
                <Fact label="Resolved from">
                  <RefSourceText source={tr.refSource} />
                </Fact>
              )}
              {tr.results.map((r) => (
                <Fact key={r.name} label={title(r.name)}>
                  <code>{r.value}</code>
                </Fact>
              ))}
            </Facts>
            <TektonStepsTable tr={tr} logPath={logPath} open={open} onLog={(key) => setOpen(open === key ? null : key)} />
          </div>
        ))
      )}
    </section>
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

// FluxRevision is a Flux revision (main@sha1:<sha>) as its commit's first 12
// characters, the whole revision on hover.
export function FluxRevision({ rev }: { rev?: string }) {
  if (!rev) return <span className="muted">—</span>;
  const sha = rev.slice(rev.lastIndexOf(":") + 1);
  return <code title={rev}>{sha.slice(0, 12)}</code>;
}

// FluxReady is a Flux object's Ready condition in words: Ready, Not ready or
// Unknown.
export function FluxReady({ o }: { o: FluxObject | null }) {
  if (!o) return <span className="muted">not observed</span>;
  if (!o.found) return <span className="muted">did not exist</span>;
  if (!o.ready) return <span className="muted">—</span>;
  const status = o.ready.status === "True" ? "SUCCEEDED" : o.ready.status === "False" ? "FAILED" : "RUNNING";
  return <Status status={status} label={o.ready.status === "True" ? "Ready" : o.ready.status === "False" ? "Not ready" : "Unknown"} />;
}

// FluxFacts are what is Flux's own of a Flux Execution: where it observed,
// from which source revision it started (baseline) and when it last saw a
// change (its status and times are the Execution's).
export function FluxFacts({ x }: { x: FluxExecution }) {
  return (
    <Facts label="Flux">
      <Fact label="Namespace">
        <code>{x.namespace}</code>
      </Fact>
      <Fact label="Baseline revision">
        <FullSha sha={x.baselineRevision} missing="—" />
      </Fact>
      <Fact label="Last observed">
        <Time at={x.observedAt} />
      </Fact>
    </Facts>
  );
}

// FluxObjectDetail is one Flux object's last observed state as a key/value
// table: the facts its snapshot has (a GitRepository's artifact revision, a
// Kustomization's attempted and applied revisions). Never one table for both.
export function FluxObjectDetail({ kind, o }: { kind: "GitRepository" | "Kustomization"; o: FluxObject | null }) {
  return (
    <section aria-label={kind}>
      <h2>{kind}</h2>
      {!o ? (
        <p className="muted">Not observed.</p>
      ) : (
        <Facts label={kind}>
          <Fact label="Name">
            <code>{o.name}</code>
          </Fact>
          {!o.found ? (
            <Fact label="State">
              <span className="muted">did not exist</span>
            </Fact>
          ) : (
            <>
              {kind === "GitRepository" ? (
                <Fact label="Revision">
                  <FluxRevision rev={o.artifactRevision} />
                </Fact>
              ) : (
                <>
                  <Fact label="Last attempted">
                    <FluxRevision rev={o.lastAttemptedRevision} />
                  </Fact>
                  <Fact label="Last applied">
                    <FluxRevision rev={o.lastAppliedRevision} />
                  </Fact>
                </>
              )}
              <Fact label="Generation">
                {o.observedGeneration ?? "—"} / {o.generation ?? "—"}
              </Fact>
              <Fact label="Ready">
                <FluxReady o={o} />
              </Fact>
              <Fact label="Reason">{o.ready?.reason ?? <span className="muted">—</span>}</Fact>
              <Fact label="Message">{o.ready?.message ? <span className="wrap">{o.ready.message}</span> : <span className="muted">—</span>}</Fact>
            </>
          )}
          <Fact label="Observed">
            <Time at={o.observedAt} />
          </Fact>
        </Facts>
      )}
    </section>
  );
}
