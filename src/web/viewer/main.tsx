// These weight-level entrypoints carry a unicode-range per subset, which the
// per-subset files (latin-400.css) omit. vite.viewer.config.ts prunes them down
// to the latin subsets and drops the woff fallback; importing the pruned
// subsets directly would lose unicode-range and let latin-ext shadow latin.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import "./styles/tokens.css";
import "./styles/layout.css";

const queryClient = new QueryClient();
const root = document.getElementById("root");

if (!root) throw new Error("missing root element");

createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
