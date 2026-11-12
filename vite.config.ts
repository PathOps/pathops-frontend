/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The build is static files for nginx; the API is the Tenant CP at the same
// origin (/api, /.well-known), so there is no proxy or base URL to configure.
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
