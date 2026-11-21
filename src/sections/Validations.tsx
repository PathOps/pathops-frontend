import { Duration, EnvironmentLabel, Head12, NotYet, RunLink, Status, Time } from "../components/ui";

// ValidationRow is one validation run as its table shows it. The Tenant CP
// has no validations yet: nothing reads one, the shape is the table's.
export interface ValidationRow {
  id: string;
  number: number;
  sourceRevision: string;
  head12?: string;
  environment: string;
  status: string;
  // tests: passed of total (null: not counted yet).
  tests: { passed: number; total: number } | null;
  startedAt: string | null;
  durationSeconds: number | null;
  deliveryRunId: string;
  deliveryNumber: number;
}

// ValidationsTable lists validation runs like Deployments: the same
// environment, status, time and delivery presentation.
export function ValidationsTable({ appId, validations }: { appId: string; validations: ValidationRow[] }) {
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Commit</th>
            <th>Environment</th>
            <th>Status</th>
            <th>Tests</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Delivery</th>
          </tr>
        </thead>
        <tbody>
          {validations.map((x) => (
            <tr key={x.id}>
              <td>{x.number}</td>
              <td>
                <Head12 revision={x.sourceRevision} head12={x.head12} />
              </td>
              <td>
                <EnvironmentLabel environment={x.environment} />
              </td>
              <td>
                <Status status={x.status} />
              </td>
              <td>{x.tests ? `${x.tests.passed}/${x.tests.total}` : <span className="muted">—</span>}</td>
              <td>
                <Time at={x.startedAt} />
              </td>
              <td>
                <Duration seconds={x.durationSeconds} />
              </td>
              <td>
                <RunLink appId={appId} id={x.deliveryRunId} number={x.deliveryNumber} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Validations: none yet (the Tenant CP runs no validations).
export function Validations() {
  return (
    <NotYet
      title="Validations"
      what="Acceptance and regression test executions for the application contract."
      state="No validations yet."
    />
  );
}
