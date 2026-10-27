import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // « server-only » refuse d'être importé hors de Next : on le neutralise pour les tests.
      "server-only": fileURLToPath(new URL("./tests/vide.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/preparer-base.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      DATE_DEMO: "2026-10-30",
      APP_TZ: "America/Port-au-Prince",
      IA_FOURNISSEUR: "aucun",
      HEURE_DEMO: "11:00",
    },
  },
});
