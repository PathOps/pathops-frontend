import { Link } from "react-router-dom";
import { useApi } from "../api/client";
import type { Inbox, InboxItem } from "../api/types";
import { useResource } from "../api/useResource";
import { InboxChanged, Page } from "../components/Page";
import { Ago, ExternalLink, Loaded, RefreshButton, Toolbar } from "../components/ui";

// InboxPage is the owner's Inbox (Decision 0061): failures that need
// attention, newest first, unread ones in bold. Opening an item's delivery
// or downloading its logs marks it read; so does "Mark read". The logs are
// downloaded from the Cell's Artifact Store directly (its own Dex sign-in),
// never through the Tenant CP.
export function InboxPage() {
  const inbox = useResource<Inbox>("/api/v1/inbox");
  const api = useApi();
  const read = (it: InboxItem) => {
    if (it.read) return;
    api
      .post<InboxItem>(`/api/v1/inbox/${it.id}/read`)
      .then(() => {
        inbox.reload();
        window.dispatchEvent(new Event(InboxChanged));
      })
      .catch(() => inbox.reload());
  };
  return (
    <Page crumbs={<> / Inbox</>}>
      <h1>Inbox</h1>
      <Toolbar actions={<RefreshButton resource={inbox} />}>
        Failures that need your attention.
        {inbox.data && inbox.data.unread > 0 && <strong> {inbox.data.unread} unread.</strong>}
      </Toolbar>
      <Loaded resource={inbox} empty={(d) => d.items.length === 0}>
        {(d) => (
          <table aria-label="Inbox">
            <thead>
              <tr>
                <th>Item</th>
                <th>Application</th>
                <th>Delivery</th>
                <th>Received</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {d.items.map((it) => (
                <tr key={it.id} className={it.read ? "read" : "unread"} aria-label={`${it.title}${it.read ? "" : " (unread)"}`}>
                  <td>
                    {!it.read && <span className="dot" title="Unread" />}
                    <span className="item-title">{it.title}</span>
                    <br />
                    <span className="muted">{it.message}</span>
                  </td>
                  <td>{it.applicationName}</td>
                  <td>
                    {it.delivery ? (
                      <>
                        #{it.delivery.number} <code>{it.delivery.head12}</code>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <Ago at={it.createdAt} />
                  </td>
                  <td className="actions">
                    {it.delivery && (
                      <Link to={`/applications/${it.applicationId}/deliveries/${it.delivery.id}`} onClick={() => read(it)}>
                        View delivery
                      </Link>
                    )}
                    {it.artifact?.downloadUrl && (
                      <span onClick={() => read(it)}>
                        <ExternalLink href={it.artifact.downloadUrl}>Download logs</ExternalLink>
                      </span>
                    )}
                    {!it.read && (
                      <button type="button" onClick={() => read(it)}>
                        Mark read
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loaded>
    </Page>
  );
}
