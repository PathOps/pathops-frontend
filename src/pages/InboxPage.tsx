import { useEffect, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi } from "../api/client";
import type { Inbox, InboxMessage } from "../api/types";
import { useResource } from "../api/useResource";
import { InboxChanged, Page } from "../components/Page";
import { Ago, ExternalLink, Fact, Facts, Loaded, Pager, RefreshButton, Toolbar, usePageCursor, withCursor } from "../components/ui";

// InboxPage is the owner's Inbox (Decision 0061), like a mail inbox: each
// message's number, subject and when it arrived, newest first, 25 a page
// (Newer / Older, paged by the Tenant CP), unread ones in bold with a dot;
// the unread count is the whole Inbox's. A message opens on its own page;
// nothing technical (ids, types, deliveries, logs) is in the list.
export function InboxPage() {
  const cursor = usePageCursor();
  const inbox = useResource<Inbox>(withCursor("/api/v1/inbox", cursor));
  const navigate = useNavigate();
  return (
    <Page crumbs={<> / Inbox</>}>
      <h1>Inbox</h1>
      <Toolbar actions={<RefreshButton resource={inbox} />}>
        {inbox.data && (inbox.data.unread > 0 ? <strong>{inbox.data.unread} unread</strong> : "Nothing unread.")}
      </Toolbar>
      <Loaded resource={inbox} empty={(d) => d.messages.length === 0}>
        {(d) => (
          <>
            <table aria-label="Inbox" className="inbox">
              <thead>
                <tr>
                  <th className="number">#</th>
                  <th>Subject</th>
                  <th className="received">Received</th>
                </tr>
              </thead>
              <tbody>
                {d.messages.map((m) => (
                  <tr
                    key={m.id}
                    className={m.read ? "read" : "unread"}
                    aria-label={`#${m.number} ${m.subject}${m.read ? "" : " (unread)"}`}
                    onClick={() => navigate(`/inbox/${m.number}`)}
                  >
                    <td className="number">
                      {!m.read && <span className="dot" title="Unread" />}
                      {m.number}
                    </td>
                    <td>
                      <Link to={`/inbox/${m.number}`} className="item-title">
                        {m.subject}
                      </Link>
                      {m.application && <div className="muted">{m.application.name}</div>}
                    </td>
                    <td className="received">
                      <Ago at={m.createdAt} /> ago
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager label="Inbox pages" newer={d.previousCursor} older={d.nextCursor} newerLabel="Newer" olderLabel="Older" />
          </>
        )}
      </Loaded>
    </Page>
  );
}

// InboxMessagePage is one message, by its number: its subject, when it
// arrived, its text, what it is about and the actions its references give
// (none for a reference it does not have). Opening it marks it read.
export function InboxMessagePage() {
  const { number = "" } = useParams();
  const valid = /^[1-9][0-9]{0,17}$/.test(number);
  const msg = useResource<InboxMessage>(`/api/v1/inbox/${valid ? number : "0"}`);
  const api = useApi();
  const marked = useRef(false);
  const m = msg.data;
  useEffect(() => {
    if (!m || m.read || marked.current) return;
    marked.current = true;
    api
      .post<InboxMessage>(`/api/v1/inbox/${m.number}/read`)
      .then(() => window.dispatchEvent(new Event(InboxChanged)))
      .catch(() => {
        marked.current = false;
      });
  }, [m, api]);
  return (
    <Page
      crumbs={
        <>
          {" "}
          / <Link to="/inbox">Inbox</Link> / #{number}
        </>
      }
    >
      <p>
        <Link to="/inbox">← Inbox</Link>
      </p>
      <Loaded resource={msg}>{(m) => <Message m={m} />}</Loaded>
    </Page>
  );
}

function Message({ m }: { m: InboxMessage }) {
  const app = m.application;
  return (
    <article className="message" aria-label={`Message #${m.number}`}>
      <div className="muted">#{m.number}</div>
      <h1>{m.subject}</h1>
      <p className="muted">
        <Received at={m.createdAt} />
      </p>
      <div className="message-body">
        {m.body.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {(app || m.delivery || m.build) && (
        <Facts label="About">
          {app && <Fact label="Application">{app.name}</Fact>}
          {m.delivery && (
            <Fact label="Revision">
              <code title={m.delivery.sourceRevision}>{m.delivery.head12}</code>
            </Fact>
          )}
          {m.delivery && <Fact label="Delivery">#{m.delivery.number}</Fact>}
          {m.build && <Fact label="Build">#{m.build.number}</Fact>}
        </Facts>
      )}
      <div className="message-actions">
        {app && (
          <Link to={`/applications/${app.id}`}>
            View application
          </Link>
        )}
        {app && m.delivery && (
          <Link to={`/applications/${app.id}/deliveries/${m.delivery.id}`}>
            View delivery
          </Link>
        )}
        {app && m.build && (
          <Link to={`/applications/${app.id}/builds/${m.build.id}`}>
            View build
          </Link>
        )}
        {m.artifact?.downloadUrl && <ExternalLink href={m.artifact.downloadUrl}>Download logs</ExternalLink>}
      </div>
    </article>
  );
}

// Received is the full local date and time, with the year.
function Received({ at }: { at: string }) {
  const d = new Date(at);
  return (
    <time dateTime={at} title={d.toISOString()}>
      {d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
    </time>
  );
}
