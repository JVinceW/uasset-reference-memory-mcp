import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Fontsource's weight-level CSS declares one @font-face per subset — cyrillic,
// cyrillic-ext, greek, vietnamese, latin, latin-ext — each with a woff2 source
// and a woff fallback. Asset paths in this viewer are effectively latin, and
// every browser that runs it reads woff2, so both the extra subsets and the
// fallback are dead payload.
//
// Prune here rather than importing fontsource's per-subset files directly:
// those omit unicode-range, so latin-ext would shadow latin for the same
// family/weight and basic ASCII would fall back to a system font.
const KEEP_SUBSET = /-(latin|latin-ext)-\d+-normal\./;
const WOFF_FALLBACK = /,\s*url\([^)]+\.woff\)\s*format\(\s*(['"])woff\1\s*\)/g;

function trimFontSubsets(): Plugin {
  return {
    name: "trim-font-subsets",
    enforce: "pre",
    transform(code, id) {
      const path = id.split("?")[0] ?? id;
      if (!id.includes("@fontsource") || !path.endsWith(".css")) return null;
      const faces = code.match(/@font-face\s*\{[^}]*\}/g);
      if (!faces) return null;
      const kept = faces.filter((face) => KEEP_SUBSET.test(face));
      if (kept.length === 0) {
        // A fontsource layout change would otherwise silently ship no fonts.
        throw new Error(`trim-font-subsets: no latin @font-face left in ${id}`);
      }
      return { code: kept.join("\n").replace(WOFF_FALLBACK, ""), map: null };
    },
  };
}

export default defineConfig({
  root: "src/web/viewer",
  base: "./",
  plugins: [trimFontSubsets(), react()],
  build: {
    outDir: "../../../dist/web/public/viewer-next",
    emptyOutDir: true,
  },
});
