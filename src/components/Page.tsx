import { useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import type { Me } from "../api/types";
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

// Page is a page of the signed-in UI: the breadcrumb (PathOps / Applications
// / ... / here), the theme, the user and sign out, then the content.
export function Page({ crumbs, children }: { crumbs?: ReactNode; children: ReactNode }) {
  const me = useResource<Me>("/api/v1/me");
  const [out, setOut] = useState(false);
  return (
    <>
      <header>
        <nav aria-label="Breadcrumb">
          <Link to="/">PathOps</Link> / <Link to="/">Applications</Link>
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
    </>
  );
}
