import { useEffect, useRef, useState, type ReactNode } from "react";
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

// useTheme is the current theme and the switch to the other one, remembered
// in this browser.
function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(currentTheme);
  const next = theme === "dark" ? "light" : "dark";
  return [
    theme,
    () => {
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem(themeKey, next);
      } catch {
        // The choice lasts for this page only.
      }
      setTheme(next);
    },
  ];
}

// InboxChanged is dispatched on window when the Inbox changed here (a
// message read): the header's count reads it again.
export const InboxChanged = "pathops-inbox-changed";

// MainNav is the header's main navigation: the Applications and the Inbox,
// with the whole Inbox's unread count; the current section is marked. The
// count is read with the page (no push channel): Refresh or another page
// shows a new message.
function MainNav() {
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
    <nav aria-label="Main" className="main-nav">
      <Link to="/applications" className={applications ? "active" : undefined} aria-current={applications ? "page" : undefined}>
        Applications
      </Link>
      <NavLink to="/inbox" aria-label={unread > 0 ? `Inbox, ${unread} unread` : "Inbox"}>
        Inbox
        {unread > 0 && (
          <span className="badge" aria-hidden="true">
            {unread}
          </span>
        )}
      </NavLink>
    </nav>
  );
}

// UserMenu is the signed-in user as a button that opens a menu: the theme
// switch and sign out. It closes on a choice, Escape or a click outside.
function UserMenu({ who, onSignOut }: { who: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  return (
    <div className="user-menu" ref={box}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {who} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div role="menu" aria-label="User">
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              toggleTheme();
              setOpen(false);
            }}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button type="button" role="menuitem" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Page is a page of the signed-in UI: the header (the breadcrumb PathOps /
// <section> / ... / here; the Applications and the Inbox; the user's menu),
// then the content and the footer. The section is the Applications
// (default) or the Inbox, whose pages give their own crumbs.
export function Page({ crumbs, inbox, children }: { crumbs?: ReactNode; inbox?: boolean; children: ReactNode }) {
  const me = useResource<Me>("/api/v1/me");
  const [out, setOut] = useState(false);
  const who = me.data ? (me.data.email ?? me.data.name ?? me.data.subject) : "Account";
  return (
    <>
      <header>
        <nav aria-label="Breadcrumb">
          <Link to="/applications">PathOps</Link>
          {!inbox && (
            <>
              {" "}
              / <Link to="/applications">Applications</Link>
            </>
          )}
          {crumbs}
        </nav>
        <span className="spacer" />
        <MainNav />
        <UserMenu
          who={who}
          onSignOut={() => {
            signOut();
            setOut(true);
          }}
        />
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
    </>
  );
}
