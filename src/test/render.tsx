import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ApiContext, ApiError, type Api } from "../api/client";
import { AppRoutes } from "../App";

// fakeApi answers paths from a table: a value, an ApiError, or a pending
// promise (loading); anything else is a 404 (not found, or not yours).
export function fakeApi(table: Record<string, unknown>): Api & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    get<T>(path: string): Promise<T> {
      calls.push(path);
      if (!(path in table)) return Promise.reject(new ApiError(404, "not_found"));
      const v = table[path];
      if (v instanceof Error) return Promise.reject(v);
      if (v instanceof Promise) return v as Promise<T>;
      return Promise.resolve(structuredClone(v) as T);
    },
  };
}

export function renderAt(path: string, api: Api) {
  return render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </MemoryRouter>
    </ApiContext.Provider>,
  );
}
