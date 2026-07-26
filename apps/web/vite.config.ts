import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@researchmind/types": path.resolve(__dirname, "../../packages/types/src/index.ts"),
      "@researchmind/api": path.resolve(__dirname, "../../packages/api/src/index.ts"),
      "@researchmind/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
      "@researchmind/utils": path.resolve(__dirname, "../../packages/utils/src/index.ts"),
      "@researchmind/config": path.resolve(__dirname, "../../packages/config/src/index.ts"),
      "@researchmind/sync": path.resolve(__dirname, "../../packages/sync/src/index.ts"),
      "@researchmind/i18n": path.resolve(__dirname, "../../packages/i18n/src/index.ts"),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
