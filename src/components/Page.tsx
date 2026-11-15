import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, NavLink, useLocation } from "react-router-dom";
import type { Inbox, Me } from "../api/types";
import { useResource } from "../api/useResource";
import { signOut } from "../auth/oidc";

const themeKey = "pathops-theme";

function savedTheme(): string | null {
  try {
    return localStorage.getItem(themeKey);
  } catch {
    return null;
  }
}

function currentTheme(): "dark" | "light" {
  const saved = savedTheme();
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// The saved theme applies before the first render (no flash).
if (typeof document !== "undefined") {
  const saved = savedTheme();
  if (saved === "dark" || saved === "light") document.documentElement.dataset.theme = saved;
}

function ThemeToggle() {
  const [theme, setTheme] = useState(currentTheme);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(themeKey, next);
        } catch {
          // The choice lasts for this page only.
        }
        setTheme(next);
      }}
    >
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}

// InboxChanged is dispatched on window when the Inbox changed here (a
// message read): the sidebar's count reads it again.
export const InboxChanged = "pathops-inbox-changed";

// Sidebar is the main navigation: the Inbox, with the whole Inbox's unread
// count, and the Applications; the current section is marked. The count is
// read with the page (no push channel): Refresh or another page shows a new
// message.
function Sidebar() {
  const inbox = useResource<Inbox>("/api/v1/inbox?unread=true&limit=1");
  const { reload } = inbox;
  useEffect(() => {
    window.addEventListener(InboxChanged, reload);
    return () => window.removeEventListener(InboxChanged, reload);
  }, [reload]);
  const unread = inbox.data?.unread ?? 0;
  const { pathname } = useLocation();
  const applications = pathname === "/" || pathname.startsWith("/applications");
  return (
    <nav aria-label="Main" className="sidebar">
      <div className="brand">PathOps</div>
      <NavLink to="/inbox" aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}>
        <span aria-hidden="true">✉</span> Inbox
        {unread > 0 && (
          <span className="badge" aria-hidden="true">
            {unread}
          </span>
        )}
      </NavLink>
      <Link to="/applications" className={applications ? "active" : undefined} aria-current={applications ? "page" : undefined}>
        <span aria-hidden="true">▤</span> Applications
      </Link>
    </nav>
  );
}

// Page is a page of the signed-in UI: the sidebar along the window's left
// edge, and beside it the header (the breadcrumb PathOps / Applications / ...
// / here, the theme, the user and sign out), the content and the footer.
export function Page({ crumbs, children }: { crumbs?: ReactNode; children: ReactNode }) {
  const me = useResource<Me>("/api/v1/me");
  const [out, setOut] = useState(false);
  return (
    <>
      <Sidebar />
      <div className="content">
        <header>
          <nav aria-label="Breadcrumb">
            <Link to="/applications">PathOps</Link> / <Link to="/applications">Applications</Link>
            {crumbs}
          </nav>
          <span className="spacer" />
          <ThemeToggle />
          {me.data && <span className="user">{me.data.email ?? me.data.name ?? me.data.subject}</span>}
          <button
            type="button"
            onClick={() => {
              signOut();
              setOut(true);
            }}
          >
            Sign out
          </button>
          {out && <Navigate to="/signed-out" replace />}
        </header>
        <main>{children}</main>
        <footer>
          <small>
            © 2026 PathOps · Open source under the{" "}
            <a href="https://github.com/PathOps/pathops-frontend/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
              MIT License ↗
            </a>
          </small>
        </footer>
      </div>
    </>
  );
}
