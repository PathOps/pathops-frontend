import { NavLink, Navigate, useParams } from "react-router-dom";
import type { Overview } from "../api/types";
import { useResource } from "../api/useResource";
import { Page } from "../components/Page";
import { Copy, EnvironmentState, ExternalLink, Loaded, NotYet, RunLink, Status } from "../components/ui";
import { deriveEnvironmentStatus } from "../environment";
import { applicationOverview } from "../live/topics";
import { Builds } from "../sections/Builds";
import { Deliveries } from "../sections/Deliveries";
import { Deployments } from "../sections/Deployments";
import { Preflight } from "../sections/Preflight";
import { Images } from "../sections/Images";
import { ProvisioningSection } from "../sections/Provisioning";
import { RepositoriesSection } from "../sections/Repositories";
import { technologyLine } from "./ApplicationsPage";

interface Section {
  title: string;
  // planned: always shown, empty until there is something in it (no
  // production yet, no Deployment before Preflight); else the
  // Tenant CP names it in overview.sections when it exists.
  planned?: boolean;
  render: (appId: string, o: Overview) => JSX.Element;
}

// The sections, in tab order.
const sections: Record<string, Section> = {
  production: {
    title: "Production",
    planned: true,
    render: () => (
      <NotYet
        title="Production"
        what="Current deployment status and runtime information."
        state="The production environment has not been created yet."
      />
    ),
  },
  preflight: {
    title: "Preflight",
    planned: true,
    render: (_id, o) =>
      o.preflight ? (
        <Preflight env={o.preflight} />
      ) : (
        <NotYet
          title="Preflight"
          what="Validation environment before production delivery."
          state="The preflight environment has not been created yet."
        />
      ),
  },
  deliveries: { title: "Delivery", render: (id) => <Deliveries appId={id} /> },
  deployments: { title: "Deployments", planned: true, render: (id) => <Deployments appId={id} /> },
  images: { title: "Images", render: (id, o) => <Images appId={id} current={{ PREFLIGHT: o.preflight?.current }} /> },
  builds: { title: "Builds", render: (id) => <Builds appId={id} /> },
  repositories: { title: "Repositories", render: (id) => <RepositoriesSection appId={id} /> },
  provisioning: { title: "Provisioning", render: (id) => <ProvisioningSection appId={id} /> },
};

// PreflightState: the Preflight environment's state ("Healthy — 2h"), the
// same as the Applications list's; no Deployment or Delivery numbers (their
// tabs have them).
function PreflightState({ o }: { o: Overview }) {
  if (!o.preflight) return <span className="muted">not created yet</span>;
  return <EnvironmentState status={deriveEnvironmentStatus(o.preflight.last)} />;
}

function Summary({ o }: { o: Overview }) {
  const last = o.deliveries.last;
  return (
    <table aria-label="Summary">
      <tbody>
        <tr>
          <th scope="row">Technology</th>
          <td>{technologyLine(o.technology)}</td>
          <th scope="row">Template</th>
          <td>{o.template.url ? <ExternalLink href={o.template.url}>{o.template.id}</ExternalLink> : o.template.id}</td>
        </tr>
        <tr>
          <th scope="row">Last delivery</th>
          <td>
            {last ? (
              <>
                <RunLink appId={o.id} id={last.id} number={last.number} /> — <Status status={last.status} />
              </>
            ) : (
              <span className="muted">none yet</span>
            )}
          </td>
          <th scope="row">Provisioning</th>
          <td>
            <Status status={o.provisioning.status} />
          </td>
        </tr>
        <tr>
          <th scope="row">Production</th>
          <td>
            <span className="muted">not created yet</span>
          </td>
          <th scope="row">Preflight</th>
          <td>
            <PreflightState o={o} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function ApplicationPage() {
  const { appId = "", section = "deliveries" } = useParams();
  const overview = useResource<Overview>(`/api/v1/applications/${encodeURIComponent(appId)}/overview`, { live: applicationOverview(appId) });
  return (
    <Page crumbs={overview.data && <> / {overview.data.name}</>}>
      <Loaded resource={overview}>
        {(o) => {
          const available = Object.keys(sections).filter((s) => sections[s].planned || o.sections.includes(s));
          if (!available.includes(section)) return <Navigate to={`/applications/${appId}/deliveries`} replace />;
          return (
            <>
              <h1>{o.name}</h1>
              <p className="muted">
                Application ID: <Copy text={o.id} />
              </p>
              <Summary o={o} />
              <nav className="tabs" aria-label="Application sections">
                {available.map((s) => (
                  <NavLink key={s} to={`/applications/${appId}/${s}`} className={({ isActive }) => (isActive ? "active" : "")}>
                    {sections[s].title}
                  </NavLink>
                ))}
              </nav>
              <section aria-label={sections[section].title}>{sections[section].render(appId, o)}</section>
            </>
          );
        }}
      </Loaded>
    </Page>
  );
}
