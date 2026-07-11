import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GraphStore } from "../store/graph-store.js";
import {
  type UnityVerificationAsset,
  type UnityVerificationDependency,
  type UnityVerificationExport,
  type VerificationReport,
  verifyIndex,
} from "./verify.js";

const GUID = /^[0-9a-f]{32}$/i;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export class VerificationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationInputError";
  }
}

export interface RunVerificationOptions {
  dbPath: string;
  verifyJsonPath: string;
  reportPath?: string;
  verifiedAt?: string;
}

export interface VerificationRun {
  reportPath: string;
  report: VerificationReport;
}

export async function runVerification(options: RunVerificationOptions): Promise<VerificationRun> {
  if (!existsSync(options.dbPath)) {
    throw new Error(`no index at ${options.dbPath} - run 'index' first`);
  }

  const exported = parseVerificationExport(await readFile(options.verifyJsonPath, "utf8"));
  const verifiedAt = options.verifiedAt ?? new Date().toISOString();
  const reportPath = options.reportPath ?? join(dirname(options.dbPath), "verify-report.json");
  const store = GraphStore.open(options.dbPath);
  try {
    const report = verifyIndex(store, exported, verifiedAt);
    await writeVerificationReport(reportPath, report);
    store.setMeta("verify_last_run", verifiedAt);
    store.setMeta("verify_last_report", reportPath);
    return { reportPath, report };
  } finally {
    store.close();
  }
}

export function parseVerificationExport(text: string): UnityVerificationExport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new VerificationInputError("verify JSON is not valid JSON");
  }

  const root = record(value, "verify JSON");
  if (root.schemaVersion !== 1) {
    throw new VerificationInputError("verify JSON schemaVersion must be 1");
  }
  const unityVersion = requiredString(root.unityVersion, "unityVersion");
  const exportedAt = requiredString(root.exportedAt, "exportedAt");
  if (!ISO_TIMESTAMP.test(exportedAt) || Number.isNaN(Date.parse(exportedAt))) {
    throw new VerificationInputError("exportedAt must be an ISO-8601 timestamp");
  }
  if (!Array.isArray(root.assets)) {
    throw new VerificationInputError("assets must be an array");
  }

  const seenAssets = new Set<string>();
  const assets = root.assets.map((asset, index) => {
    const parsed = parseAsset(asset, `assets[${index}]`);
    if (seenAssets.has(parsed.guid)) {
      throw new VerificationInputError(`assets[${index}].guid is duplicated`);
    }
    seenAssets.add(parsed.guid);
    return parsed;
  });

  return { schemaVersion: 1, unityVersion, exportedAt, assets };
}

async function writeVerificationReport(path: string, report: VerificationReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function parseAsset(value: unknown, location: string): UnityVerificationAsset {
  const asset = record(value, location);
  const path = requiredString(asset.path, `${location}.path`);
  const guid = requiredGuid(asset.guid, `${location}.guid`);
  if (!Array.isArray(asset.dependencies)) {
    throw new VerificationInputError(`${location}.dependencies must be an array`);
  }
  return {
    path,
    guid,
    dependencies: asset.dependencies.map((dependency, index) => parseDependency(dependency, `${location}.dependencies[${index}]`)),
  };
}

function parseDependency(value: unknown, location: string): UnityVerificationDependency {
  const dependency = record(value, location);
  return {
    path: requiredString(dependency.path, `${location}.path`),
    guid: requiredGuid(dependency.guid, `${location}.guid`),
  };
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new VerificationInputError(`${location} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, location: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new VerificationInputError(`${location} must be a non-empty string`);
  }
  return value;
}

function requiredGuid(value: unknown, location: string): string {
  const guid = requiredString(value, location).toLowerCase();
  if (!GUID.test(guid)) {
    throw new VerificationInputError(`${location} must be a 32-character hexadecimal GUID`);
  }
  return guid;
}
