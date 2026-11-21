import { useParams } from "react-router-dom";
import type { DeploymentDetail } from "../api/types";
import { useResource, type Resource } from "../api/useResource";
import { Page } from "../components/Page";
import {
  BuildLink,
  Copy,
  CopyButton,
  Duration,
  EnvironmentLabel,
  Fact,
  Facts,
  Loaded,
  RunLink,
  Short,
  Status,
  Time,
  humanize,
} from "../components/ui";
import { deployment } from "../live/topics";
import { AppCrumbs } from "./BuildPage";

// DeploymentPage is one Deployment: what it applied where, and how it went.
// Its delivery's page has the steps; this one may grow (events, evidence).
// Live: a Deployment's change is its delivery run's (DELIVERY_CHANGED).
export function DeploymentPage() {
  const { appId = "", deploymentId = "" } = useParams();
  const r: Resource<DeploymentDetail> = useResource(
    `/api/v1/applications/${encodeURIComponent(appId)}/deployments/${encodeURIComponent(deploymentId)}`,
    { live: (e) => deployment(appId, r.data?.deliveryRunId)(e) },
  );
  return (
    <Page crumbs={<AppCrumbs appId={appId} section="deployments" title="Deployments" />}>
      <Loaded resource={r}>
        {(d) => (
          <>
            <h1>Deployment #{d.number}</h1>
            <Facts label="Deployment">
              <Fact label="Environment">
                <EnvironmentLabel environment={d.environment} />
              </Fact>
              <Fact label="Status">
                <Status status={d.status} />
              </Fact>
              {d.failureMessage && (
                <Fact label="Error">
                  <span className="error">
                    {d.failureReason ? `${humanize(d.failureReason)}: ` : ""}
                    {d.failureMessage}
                  </span>
                </Fact>
              )}
              <Fact label="Commit">
                <Copy text={d.sourceRevision} />
              </Fact>
              <Fact label="Image">
                <Short text={d.image?.digest ?? d.imageReference} /> <CopyButton text={d.imageReference} label="image reference" />
                {d.build && (
                  <>
                    {" — Build "}
                    <BuildLink appId={appId} id={d.build.id} number={d.build.number} />
                  </>
                )}
              </Fact>
              <Fact label="Delivery">
                <RunLink appId={appId} id={d.deliveryRunId} number={d.deliveryNumber} />
              </Fact>
              <Fact label="Started">
                <Time at={d.startedAt} />
              </Fact>
              <Fact label="Duration">
                <Duration seconds={d.durationSeconds} />
              </Fact>
              <Fact label="GitOps commit">
                {d.gitopsCommit ? (
                  <Copy text={d.gitopsCommit}>
                    <Short text={d.gitopsCommit} />
                  </Copy>
                ) : (
                  <span className="muted">not yet</span>
                )}
              </Fact>
            </Facts>
          </>
        )}
      </Loaded>
    </Page>
  );
}
