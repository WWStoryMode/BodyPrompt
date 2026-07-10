import { defineConfig } from "vite";

// Minimal dev/build config. The dev server runs on 5173 — the FastAPI service
// (service/) whitelists that origin for CORS.
export default defineConfig({
  server: {
    port: 5173,
  },
});
