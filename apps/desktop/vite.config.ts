/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    allowedHosts: true,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Stable dependency groups improve caching and keep the initial app
        // chunk small enough to parse quickly on lower-end desktop devices.
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("@tiptap") || id.includes("prosemirror")) return "editor";
          if (id.includes("vis-network")) return "graph-network";
          if (id.includes("vis-data")) return "graph-data";
          if (id.includes("@clerk") || id.includes("firebase")) return "auth-vendor";
          if (id.includes("@tauri-apps")) return "tauri-vendor";
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react-vendor";
          }
          if (
            id.includes("i18next") ||
            id.includes("marked") ||
            id.includes("turndown")
          ) {
            return "content-vendor";
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: "node",
  },
}));
