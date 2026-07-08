// Static (WASM) flavor: run the shared query layer entirely in the browser over
// a user-picked index.db, with no server. Reuses app.js by installing a
// window.__PROVIDER that calls the same handleApi the Node server uses.
import { handleApi } from "../api.js";

const statsEl = document.getElementById("stats");

function wasmStore(sqlDb) {
  return {
    all(sql, params = []) {
      const stmt = sqlDb.prepare(sql);
      stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    },
  };
}

async function loadDatabase(bytes) {
  const SQL = await window.initSqlJs({ locateFile: (f) => "vendor/" + f });
  const sqlDb = new SQL.Database(new Uint8Array(bytes));
  const store = wasmStore(sqlDb);

  window.__PROVIDER = (path, params) => {
    const { status, body } = handleApi(store, path, params);
    if (status >= 400) throw Object.assign(new Error(body.error || "error"), { body });
    return body;
  };

  document.getElementById("ref").placeholder =
    "asset path, name, or guid — e.g. Assets/…/Player.prefab";
  await window.__bootViewer();
}

document.getElementById("dbfile").addEventListener("change", async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  statsEl.textContent = `loading ${file.name}…`;
  try {
    await loadDatabase(await file.arrayBuffer());
  } catch (err) {
    statsEl.innerHTML = `<span class="err">${err.message}</span>`;
  }
});

// Convenience: ?db=<url> auto-fetches a database (works when served over http).
(async () => {
  const dbUrl = new URLSearchParams(location.search).get("db");
  if (!dbUrl) return;
  statsEl.textContent = `fetching ${dbUrl}…`;
  try {
    const res = await fetch(dbUrl);
    await loadDatabase(await res.arrayBuffer());
  } catch (err) {
    statsEl.innerHTML = `<span class="err">${err.message}</span>`;
  }
})();
