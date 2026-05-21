import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    host: true,                 // bind 0.0.0.0 so LAN can reach the dev server
    port: 5174,
    strictPort: false,
    // LAN clients send Host: 192.168.x.x — accept those.
    // (Vite 5 default rejects unknown hosts in dev when bound on 0.0.0.0.)
    allowedHosts: true,
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
});
