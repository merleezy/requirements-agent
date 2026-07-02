import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    /* Same-origin API calls in dev; the Express server owns /api. */
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
