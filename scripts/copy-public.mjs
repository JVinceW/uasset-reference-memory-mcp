import { cp } from "node:fs/promises";

// Copy the viewer's static assets into the build output (tsc emits only JS).
await cp(
  new URL("../src/web/public/", import.meta.url),
  new URL("../dist/web/public/", import.meta.url),
  { recursive: true },
);
console.log("copied src/web/public -> dist/web/public");
