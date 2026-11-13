import { Link } from "react-router-dom";
import type { Overview } from "../api/types";
import { ExternalLink, Field, Head12, StatusBadge, Time } from "../components/ui";

export function General({ overview: o }: { overview: Overview }) {
  const t = o.technology;
  return (
    <div className="grid">
      <dl className="panel">
        <h2>Application</h2>
        <Field label="Name">{o.name}</Field>
        <Field label="Status">
          <StatusBadge status={o.status} />
        </Field>
        <Field label="Owner">
          {o.owner.name} <span className="muted">({o.owner.email})</span>
        </Field>
        <Field label="Created">
          <Time at={o.createdAt} />
        </Field>
      </dl>
      <dl className="panel">
        <h2>Template</h2>
        <Field label="Template">{o.template.id}</Field>
        <Field label="Revision">
          {o.template.revision ? (
            <Head12 revision={o.template.revision} />
          ) : (
            <span className="muted">not resolved yet</span>
          )}
        </Field>
        {o.template.url && (
          <Field label="Source">
            <ExternalLink href={o.template.url}>{o.template.url}</ExternalLink>
          </Field>
        )}
        <Field label="Ref">{o.template.ref}</Field>
        {o.template.digest && (
          <Field label="Digest">
            <code className="small">{o.template.digest}</code>
          </Field>
        )}
      </dl>
      <dl className="panel">
        <h2>Technology</h2>
        {t ? (
          <>
            {t.runtime && <Field label="Runtime">{t.runtime}</Field>}
            {t.language && <Field label="Language">{t.language}</Field>}
            {t.framework && <Field label="Framework">{t.framework}</Field>}
            {t.build && <Field label="Build">{t.build}</Field>}
          </>
        ) : (
          <p className="muted">The template declares no technology.</p>
        )}
      </dl>
      <dl className="panel">
        <h2>Activity</h2>
        <Field label="Provisioning">
          <StatusBadge status={o.provisioning.status} /> {o.provisioning.succeeded}/{o.provisioning.steps} steps
        </Field>
        <Field label="Delivery runs">
          {o.deliveries.total} ({o.deliveries.succeeded} succeeded, {o.deliveries.failed} failed, {o.deliveries.running} running)
        </Field>
        <Field label="Last delivery">
          {o.deliveries.last ? (
            <Link to={`/applications/${o.id}/deliveries/${o.deliveries.last.id}`}>
              <StatusBadge status={o.deliveries.last.status} />{" "}
              <Head12 revision={o.deliveries.last.sourceRevision} head12={o.deliveries.last.head12} />
            </Link>
          ) : (
            <span className="muted">none yet</span>
          )}
        </Field>
        <Field label="Images">{o.images}</Field>
      </dl>
    </div>
  );
}
