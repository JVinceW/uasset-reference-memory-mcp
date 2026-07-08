import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Architecture Decision Records stored as git-diffable markdown under
 * `.asset-memory/adrs/NNNN-slug.md` (E09). Committable and human-readable, like a
 * classic ADR log; the `manage_adr` MCP tool wraps these functions.
 */
export interface AdrFields {
  title: string;
  status?: string;
  context?: string;
  decision?: string;
  consequences?: string;
}

export interface AdrSummary {
  id: number;
  title: string;
  status: string;
  path: string;
}

export interface AdrDetail extends AdrSummary {
  content: string;
}

const FILE_RE = /^(\d{4})-.*\.md$/;
const DEFAULT_STATUS = "Proposed";

function slug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "adr";
}

function render(id: number, f: Required<Omit<AdrFields, "status">> & { status: string }): string {
  return [
    `# ADR-${String(id).padStart(4, "0")}: ${f.title}`,
    "",
    `- Status: ${f.status}`,
    "",
    "## Context",
    "",
    f.context || "_TBD_",
    "",
    "## Decision",
    "",
    f.decision || "_TBD_",
    "",
    "## Consequences",
    "",
    f.consequences || "_TBD_",
    "",
  ].join("\n");
}

async function listFiles(dir: string): Promise<{ id: number; file: string }[]> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  return entries
    .map((file) => ({ file, m: FILE_RE.exec(file) }))
    .filter((e) => e.m)
    .map((e) => ({ id: Number(e.m![1]), file: e.file }))
    .sort((a, b) => a.id - b.id);
}

function parse(id: number, path: string, content: string): AdrDetail {
  const titleMatch = /^#\s*ADR-\d+:\s*(.*)$/m.exec(content);
  const statusMatch = /^-\s*Status:\s*(.*)$/m.exec(content);
  return {
    id,
    title: titleMatch ? titleMatch[1]!.trim() : "",
    status: statusMatch ? statusMatch[1]!.trim() : DEFAULT_STATUS,
    path,
    content,
  };
}

export async function createAdr(dir: string, fields: AdrFields): Promise<AdrSummary> {
  await mkdir(dir, { recursive: true });
  const files = await listFiles(dir);
  const id = (files.at(-1)?.id ?? 0) + 1;
  const status = fields.status ?? DEFAULT_STATUS;
  const path = join(dir, `${String(id).padStart(4, "0")}-${slug(fields.title)}.md`);
  await writeFile(
    path,
    render(id, {
      title: fields.title,
      status,
      context: fields.context ?? "",
      decision: fields.decision ?? "",
      consequences: fields.consequences ?? "",
    }),
  );
  return { id, title: fields.title, status, path };
}

export async function listAdrs(dir: string): Promise<AdrSummary[]> {
  const files = await listFiles(dir);
  const out: AdrSummary[] = [];
  for (const { id, file } of files) {
    const path = join(dir, file);
    const d = parse(id, path, await readFile(path, "utf8"));
    out.push({ id: d.id, title: d.title, status: d.status, path: d.path });
  }
  return out;
}

export async function getAdr(dir: string, id: number): Promise<AdrDetail | null> {
  const match = (await listFiles(dir)).find((f) => f.id === id);
  if (!match) return null;
  const path = join(dir, match.file);
  return parse(id, path, await readFile(path, "utf8"));
}

export async function updateAdr(
  dir: string,
  id: number,
  patch: Partial<AdrFields>,
): Promise<AdrDetail | null> {
  const current = await getAdr(dir, id);
  if (!current) return null;
  const c = current.content;
  const field = (name: string): string => {
    const m = new RegExp(`## ${name}\\n\\n([\\s\\S]*?)\\n\\n(?=## |$)`).exec(c);
    return m ? m[1]!.trim() : "";
  };
  const merged = render(id, {
    title: patch.title ?? current.title,
    status: patch.status ?? current.status,
    context: patch.context ?? field("Context"),
    decision: patch.decision ?? field("Decision"),
    consequences: patch.consequences ?? field("Consequences"),
  });
  await writeFile(current.path, merged);
  return parse(id, current.path, merged);
}
