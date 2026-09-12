import { defineConfig } from "vite";

// Minimal dev/build config. The dev server runs on 5173 — the FastAPI service
// (service/) whitelists that origin for CORS.
//
// `base` applies to the build only. The published site serves the instrument from a
// subdirectory of the Pages site, so assets have to resolve from there; the dev server keeps
// serving at the root, where every existing habit and boot-flag URL still works.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/BodyPrompt/app/" : "/",
  server: {
    port: 5173,
  },
}));
