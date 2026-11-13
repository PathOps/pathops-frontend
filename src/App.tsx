import { useEffect, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { SigningIn, signIn } from "./api/client";
import { CALLBACK_PATH, completeSignIn, signedIn } from "./auth/oidc";
import { ApplicationPage } from "./pages/ApplicationPage";
import { ApplicationsPage } from "./pages/ApplicationsPage";
import { BuildPage } from "./pages/BuildPage";
import { DeliveryPage } from "./pages/DeliveryPage";

// Routes. /api, /.well-known and /healthz are the Tenant CP's at this origin;
// everything else is this application's.
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<ApplicationsPage />} />
      <Route path="/applications/:appId" element={<RedirectToDefault />} />
      <Route path="/applications/:appId/deliveries/:runId" element={<DeliveryPage />} />
      <Route path="/applications/:appId/builds/:buildId" element={<BuildPage />} />
      <Route path="/applications/:appId/:section" element={<ApplicationPage />} />
      <Route path="*" element={<main><p className="muted">No such page.</p><Link to="/">Applications</Link></main>} />
    </Routes>
  );
}

// An Application opens at its delivery runs.
function RedirectToDefault() {
  return <Navigate to="deliveries" replace />;
}

let signingIn = false;

// Signed is the signed-in application; without a token it starts the sign-in
// at the Cell's Dex.
function Signed({ children }: { children: ReactNode }) {
  const [ready] = useState(signedIn());
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!ready && !signingIn) {
      signingIn = true;
      signIn().catch((e: Error) => !(e instanceof SigningIn) && setError(e.message));
    }
  }, [ready]);
  if (error) return <main><p className="error" role="alert">Cannot sign in: {error}</p></main>;
  if (!ready) return <main><p className="muted" role="status">Signing in…</p></main>;
  return <>{children}</>;
}

// One code exchange per callback page, also when an effect runs twice.
let exchange: Promise<string> | null = null;

function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    exchange ??= completeSignIn(window.location.search);
    exchange
      .then((to) => navigate(to, { replace: true }))
      .catch((e: Error) => setError(e.message));
  }, [navigate]);
  if (error)
    return (
      <main>
        <p className="error" role="alert">Sign-in failed: {error}</p>
        <a href="/">Try again</a>
      </main>
    );
  return <main><p className="muted" role="status">Signing in…</p></main>;
}

function SignedOut() {
  return (
    <main>
      <p>You are signed out of this page. Your Cell login session at Dex stays until it ends.</p>
      <a href="/">Sign in again</a>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path={CALLBACK_PATH} element={<Callback />} />
      <Route path="/signed-out" element={<SignedOut />} />
      <Route
        path="*"
        element={
          <Signed>
            <AppRoutes />
          </Signed>
        }
      />
    </Routes>
  );
}
