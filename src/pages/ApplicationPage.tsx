import { NavLink, Navigate, useParams } from "react-router-dom";
import type { Overview } from "../api/types";
import { useResource } from "../api/useResource";
import { Copy, Loaded, RefreshButton, StatusBadge } from "../components/ui";
import { Builds } from "../sections/Builds";
import { Deliveries } from "../sections/Deliveries";
import { General } from "../sections/General";
import { Images } from "../sections/Images";
import { ProvisioningSection } from "../sections/Provisioning";
import { RepositoriesSection } from "../sections/Repositories";

// The sections this UI knows, in order. The Tenant CP says which exist for
// an Application (overview.sections): preflight and production appear when
// their delivery slices do (Decision 0060 §9), never before.
const sections: Record<string, { title: string; render: (appId: string, o: Overview) => JSX.Element }> = {
  general: { title: "General", render: (_, o) => <General overview={o} /> },
  provisioning: { title: "Provisioning", render: (id) => <ProvisioningSection appId={id} /> },
  repositories: { title: "Repositories", render: (id) => <RepositoriesSection appId={id} /> },
  builds: { title: "Builds", render: (id) => <Builds appId={id} /> },
  images: { title: "Images", render: (id, o) => <Images appId={id} appName={o.name} /> },
  deliveries: { title: "Delivery Runs", render: (id) => <Deliveries appId={id} /> },
};

export function ApplicationPage() {
  const { appId = "", section = "general" } = useParams();
  const overview = useResource<Overview>(`/api/v1/applications/${encodeURIComponent(appId)}/overview`);
  return (
    <main>
      <Loaded resource={overview}>
        {(o) => {
          const available = o.sections.filter((s) => s in sections);
          if (!available.includes(section)) return <Navigate to={`/applications/${appId}/general`} replace />;
          return (
            <>
              <div className="page-head">
                <h1>
                  {o.name} <StatusBadge status={o.status} />
                </h1>
                <RefreshButton resource={overview} />
              </div>
              <p className="muted small">
                Application <Copy text={o.id} />
              </p>
              <nav className="tabs" aria-label="Application sections">
                {available.map((s) => (
                  <NavLink key={s} to={`/applications/${appId}/${s}`} className={({ isActive }) => (isActive ? "tab active" : "tab")}>
                    {sections[s].title}
                  </NavLink>
                ))}
              </nav>
              <section aria-label={sections[section].title}>{sections[section].render(appId, o)}</section>
            </>
          );
        }}
      </Loaded>
    </main>
  );
}
