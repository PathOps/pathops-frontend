import { createContext, useContext } from "react";
import { accessToken, authorizationUrl, loadConfig, signOut } from "../auth/oidc";

// ApiError is a non-2xx answer of the Tenant CP: its status and error code
// ("not_found", "tekton_unavailable", ...).
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`${status} ${code}`);
  }
}

// SigningIn: the browser is being sent to the Cell's Dex.
export class SigningIn extends Error {}

export interface Api {
  get<T>(path: string): Promise<T>;
}

// signIn sends the browser to the Cell's Dex, to come back to the current page.
export async function signIn(): Promise<never> {
  const url = await authorizationUrl(await loadConfig(), window.location.pathname + window.location.search);
  window.location.assign(url);
  throw new SigningIn();
}

// httpApi calls the Tenant CP at this origin with the signed-in user's token.
// A missing or refused token signs in again.
export const httpApi: Api = {
  async get<T>(path: string): Promise<T> {
    const token = await accessToken();
    if (!token) return signIn();
    const r = await fetch(path, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (r.status === 401) {
      signOut();
      return signIn();
    }
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new ApiError(r.status, typeof body.error === "string" ? body.error : "error");
    }
    return (await r.json()) as T;
  },
};

export const ApiContext = createContext<Api>(httpApi);

export function useApi(): Api {
  return useContext(ApiContext);
}
