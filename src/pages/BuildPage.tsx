import { Fragment, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { BuildDetail, Log, Overview, Tasks, TaskRunView } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Page } from "../components/Page";
import {
  Copy,
  Duration,
  ErrorBox,
  Fact,
  Facts,
  Loaded,
  RefreshButton,
  RunLink,
  Status,
  Time,
  Toolbar,
  newestFirst,
  seconds,
} from "../components/ui";

const observationText: Record<string, string> = {
  not_found: "Tekton no longer has this PipelineRun (pruned), or has not created it yet.",
  unavailable: "Tekton could not be read right now.",
};

// AppCrumbs is "/ <application> / <section>" of a page under an Application.
export function AppCrumbs({ appId, section, title }: { appId: string; section: string; title: string }) {
  const o = useResource<Overview>(`/api/v1/applications/${encodeURIComponent(appId)}/overview`);
  return (
    <>
      {" / "}
      <Link to={`/applications/${appId}`}>{o.data?.name ?? "Application"}</Link>
      {" / "}
      <Link to={`/applications/${appId}/${section}`}>{title}</Link>
    </>
  );
}

export function BuildPage() {
  const { appId = "", buildId = "" } = useParams();
  const b = useResource<BuildDetail>(`/api/v1/builds/${encodeURIComponent(buildId)}`, { pollWhile: (d) => running(d.status) });
  return (
    <Page crumbs={<AppCrumbs appId={appId} section="builds" title="Builds" />}>
      <Loaded resource={b}>
        {(d) => (
          <>
            <h1>Build #{d.number}</h1>
            <Toolbar actions={<RefreshButton resource={b} />} />
            <Facts label="Build">
              <Fact label="Build ID">
                <code>{d.id}</code>
              </Fact>
              <Fact label="Status">
                <Status status={d.status} />
              </Fact>
              {d.sanitizedError && (
                <Fact label="Error">
                  <span className="error">{d.sanitizedError}</span>
                </Fact>
              )}
              <Fact label="Commit">
                <Copy text={d.sourceRevision} />
              </Fact>
              <Fact label="Delivery">
                <RunLink appId={appId} id={d.deliveryRunId} number={d.deliveryNumber} />
              </Fact>
              <Fact label="Started">
                <Time at={d.startedAt} />
              </Fact>
              <Fact label="Completed">
                <Time at={d.completedAt} />
              </Fact>
              <Fact label="Duration">
                <Duration seconds={d.durationSeconds} />
              </Fact>
              <Fact label="Image">{d.image ? <Copy text={d.image.reference} /> : <span className="muted">no image</span>}</Fact>
              {d.image && (
                <Fact label="Digest">
                  <Copy text={d.image.digest} />
                </Fact>
              )}
              <Fact label="Trigger event">{d.triggerEventId ?? <span className="muted">—</span>}</Fact>
            </Facts>
            <h2>PipelineRun</h2>
            <PipelineRunFacts build={d} />
            <section aria-label="TaskRuns">
              <h2>TaskRuns</h2>
              <TaskRunList buildId={d.id} buildRunning={running(d.status)} />
            </section>
          </>
        )}
      </Loaded>
    </Page>
  );
}

// PipelineRunFacts is what Tekton reports of a build's PipelineRun, or why
// it cannot be read.
export function PipelineRunFacts({ build }: { build: BuildDetail }) {
  const pr = build.pipelineRunStatus;
  return (
    <Facts label="PipelineRun">
      <Fact label="Name">
        <code>
          {build.pipelineRun.namespace}/{build.pipelineRun.name}
        </code>
      </Fact>
      {!pr ? (
        <Fact label="Status">
          <span className="muted">{observationText[build.observation] ?? build.observation}</span>
        </Fact>
      ) : (
        <>
          <Fact label="Status">
            <Status status={pr.status} label={pr.reason || pr.status} />
          </Fact>
          {pr.message && <Fact label="Message">{pr.message}</Fact>}
          <Fact label="Started">
            <Time at={pr.startTime} />
          </Fact>
          <Fact label="Completed">
            <Time at={pr.completionTime} />
          </Fact>
          {pr.results.map((r) => (
            <Fact key={r.name} label={r.name}>
              <code>{r.value}</code>
            </Fact>
          ))}
        </>
      )}
    </Facts>
  );
}

// TaskRunList is a build's TaskRuns with their steps, latest first. One
// step's log is open at a time, in the row under that step.
export function TaskRunList({ buildId, buildRunning }: { buildId: string; buildRunning: boolean }) {
  const t = useResource<Tasks>(`/api/v1/builds/${encodeURIComponent(buildId)}/tasks`, { pollWhile: () => buildRunning });
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Loaded resource={t}>
      {(d) =>
        d.observation !== "observed" ? (
          <p className="muted">{observationText[d.observation] ?? d.observation}</p>
        ) : d.taskRuns.length === 0 ? (
          <p className="muted">No TaskRun yet.</p>
        ) : (
          <>
            {newestFirst(d.taskRuns).map((tr) => (
              <TaskRun key={tr.name} buildId={buildId} tr={tr} open={open} onLog={(key) => setOpen(open === key ? null : key)} />
            ))}
          </>
        )
      }
    </Loaded>
  );
}

function TaskRun({ buildId, tr, open, onLog }: { buildId: string; tr: TaskRunView; open: string | null; onLog: (key: string) => void }) {
  return (
    <div aria-label={`TaskRun ${tr.pipelineTask}`} role="group">
      <h3>
        {tr.pipelineTask} — <Status status={tr.status} label={tr.reason || tr.status || tr.observation} />
      </h3>
      <Facts label={`TaskRun ${tr.pipelineTask} facts`}>
        <Fact label="TaskRun">
          <code>{tr.name}</code>
        </Fact>
        {tr.task && <Fact label="Task">{tr.task}</Fact>}
        <Fact label="Started">
          <Time at={tr.startTime} />
        </Fact>
        <Fact label="Duration">
          <Duration seconds={seconds(tr.startTime, tr.completionTime)} />
        </Fact>
        {tr.message && <Fact label="Message">{tr.message}</Fact>}
      </Facts>
      <div className="scroll">
        <table>
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
      </div>
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
    <div aria-label={`Log of ${step}`} role="log">
      {r.data.truncated && (
        <p>
          <small>
            Truncated: the last {r.data.tailLines} lines, at most {Math.round(r.data.limitBytes / 1024)} KiB.
          </small>
        </p>
      )}
      <pre>{r.data.content || "(empty)"}</pre>
    </div>
  );
}
