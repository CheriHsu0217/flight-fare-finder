import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Plain client-side SPA: `vite build` emits static files to dist/.
// Deep links (/app, /signin, ...) are served index.html by vercel.json.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  build: { outDir: "dist" },
});
