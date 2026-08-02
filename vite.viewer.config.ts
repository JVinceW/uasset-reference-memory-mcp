import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/web/viewer",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../../../dist/web/public/viewer-next",
    emptyOutDir: true,
  },
});
