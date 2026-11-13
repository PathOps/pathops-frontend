import { Fragment } from "react";
import type { Provisioning, ProvisioningStep } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Duration, Loaded, RefreshButton, Status, Time, Toolbar, humanize, newestFirst, seconds } from "../components/ui";

// A step's span: its first attempt's start to its last attempt's end.
function span(s: ProvisioningStep): { start: string | null; end: string | null } {
  return { start: s.attempts[0]?.startedAt ?? null, end: s.attempts[s.attempts.length - 1]?.completedAt ?? null };
}

export function ProvisioningSection({ appId }: { appId: string }) {
  const p = useResource<Provisioning>(`/api/v1/applications/${appId}/provisioning`, {
    pollWhile: (d) => running(d.run.status),
  });
  return (
    <>
      <h2>Provisioning</h2>
      <Loaded resource={p}>
        {(d) => (
          <>
            <Toolbar actions={<RefreshButton resource={p} />}>
              Steps executed when creating the application: <Status status={d.run.status} />, completed{" "}
              <Time at={d.run.completedAt} />.
            </Toolbar>
            <div className="scroll">
              <table aria-label="Provisioning steps">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Step</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Started</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {newestFirst(d.steps).map((s) => {
                    const { start, end } = span(s);
                    return (
                      <Fragment key={s.position}>
                        <tr>
                          <td>{s.position}</td>
                          <td>{humanize(s.type)}</td>
                          <td>
                            <Status status={s.status} />
                          </td>
                          <td>{s.attemptCount}</td>
                          <td>
                            <Time at={start} />
                          </td>
                          <td>
                            <Duration seconds={seconds(start, end)} />
                          </td>
                        </tr>
                        {s.sanitizedError && (
                          <tr>
                            <td />
                            <td colSpan={5} className="error">
                              {s.sanitizedError}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Loaded>
    </>
  );
}
