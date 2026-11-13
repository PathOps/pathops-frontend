import { NavLink, Navigate, useParams } from "react-router-dom";
import type { Overview } from "../api/types";
import { useResource } from "../api/useResource";
import { Page } from "../components/Page";
import { Copy, ExternalLink, Loaded, RefreshButton, RunLink, Status, UnderConstruction } from "../components/ui";
import { Builds } from "../sections/Builds";
import { Deliveries } from "../sections/Deliveries";
import { Images } from "../sections/Images";
import { ProvisioningSection } from "../sections/Provisioning";
import { RepositoriesSection } from "../sections/Repositories";
import { technologyLine } from "./ApplicationsPage";

interface Section {
  title: string;
  // planned: shown as under construction until its slice ships; else the
  // Tenant CP names it in overview.sections when it exists.
  planned?: boolean;
  render: (appId: string, o: Overview) => JSX.Element;
}

// The sections, in tab order.
const sections: Record<string, Section> = {
  production: {
    title: "Production",
    planned: true,
    render: () => <UnderConstruction title="Production" what="Current deployment status and runtime information." />,
  },
  preflight: {
    title: "Preflight",
    planned: true,
    render: () => <UnderConstruction title="Preflight" what="Validation environment before production delivery." />,
  },
  deliveries: { title: "Delivery", render: (id) => <Deliveries appId={id} /> },
  validations: {
    title: "Validations",
    planned: true,
    render: () => (
      <UnderConstruction title="Validations" what="Acceptance and regression test executions for the application contract." />
    ),
  },
  images: { title: "Images", render: (id) => <Images appId={id} /> },
  builds: { title: "Builds", render: (id) => <Builds appId={id} /> },
  repositories: { title: "Repositories", render: (id) => <RepositoriesSection appId={id} /> },
  provisioning: { title: "Provisioning", render: (id) => <ProvisioningSection appId={id} /> },
};

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
            <span className="muted">Under construction</span>
          </td>
          <th scope="row">Preflight</th>
          <td>
            <span className="muted">Under construction</span>
          </td>
        </tr>
      </tbody>
    </table>
  );
}

export function ApplicationPage() {
  const { appId = "", section = "deliveries" } = useParams();
  const overview = useResource<Overview>(`/api/v1/applications/${encodeURIComponent(appId)}/overview`);
  return (
    <Page crumbs={overview.data && <> / {overview.data.name}</>}>
      <Loaded resource={overview}>
        {(o) => {
          const available = Object.keys(sections).filter((s) => sections[s].planned || o.sections.includes(s));
          if (!available.includes(section)) return <Navigate to={`/applications/${appId}/deliveries`} replace />;
          return (
            <>
              <h1>{o.name}</h1>
              <p>
                Application ID: <Copy text={o.id} /> <RefreshButton resource={overview} />
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
