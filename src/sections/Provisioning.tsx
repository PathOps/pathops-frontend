import { useState } from "react";
import type { Provisioning } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Loaded, RefreshButton, StatusBadge, Time, humanize } from "../components/ui";

export function ProvisioningSection({ appId }: { appId: string }) {
  const p = useResource<Provisioning>(`/api/v1/applications/${appId}/provisioning`, {
    pollWhile: (d) => running(d.run.status),
  });
  const [open, setOpen] = useState<number | null>(null);
  return (
    <Loaded resource={p}>
      {(d) => (
        <>
          <div className="page-head">
            <h2>
              Provisioning run <StatusBadge status={d.run.status} />
            </h2>
            <RefreshButton resource={p} />
          </div>
          <p className="muted small">
            {humanize(d.run.type)} · started <Time at={d.run.createdAt} /> · completed <Time at={d.run.completedAt} />
          </p>
          <ol className="steps">
            {d.steps.map((s) => (
              <li key={s.position} className={`step step-${s.status}`}>
                <button type="button" className="step-head" aria-expanded={open === s.position}
                  onClick={() => setOpen(open === s.position ? null : s.position)}>
                  <StatusBadge status={s.status} label={humanize(s.type)} />
                  <span className="muted small">
                    {s.attemptCount} attempt{s.attemptCount === 1 ? "" : "s"}
                  </span>
                </button>
                {s.sanitizedError && <p className="error-text">{s.sanitizedError}</p>}
                {open === s.position && (
                  <table className="attempts">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Status</th>
                        <th>Observation</th>
                        <th>Action</th>
                        <th>External ref</th>
                        <th>Started</th>
                        <th>Completed</th>
                        <th>Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.attempts.map((a) => (
                        <tr key={a.number}>
                          <td>{a.number}</td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                          <td>{a.observation ?? "—"}</td>
                          <td>{a.action ?? "—"}</td>
                          <td>
                            <code className="small">{a.externalRef ?? "—"}</code>
                          </td>
                          <td>
                            <Time at={a.startedAt} />
                          </td>
                          <td>
                            <Time at={a.completedAt} />
                          </td>
                          <td className="error-text">{a.sanitizedError ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Loaded>
  );
}
