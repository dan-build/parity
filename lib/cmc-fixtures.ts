/**
 * Record / replay transports for the CMC client.
 *
 * fixtures/_index.json maps a canonical request key (see `requestKey`) to
 * { file, status }. The probe records through `recordingTransport`; tests (and
 * later, fixture mode) replay through `fixtureTransport`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { requestKey, type Transport } from "./cmc";

export type FixtureIndex = Record<string, { file: string; status: number }>;

const INDEX_FILE = "_index.json";

/** Readable, filesystem-safe name for a request key. */
export function fixtureFileName(key: string): string {
  const base = key.replace(/^\//, "").replace(/[^a-zA-Z0-9=._-]+/g, "_");
  if (base.length <= 150) return `${base}.json`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 10);
  return `${base.slice(0, 140)}_${hash}.json`;
}

export function readFixtureIndex(dir: string): FixtureIndex {
  const p = join(dir, INDEX_FILE);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as FixtureIndex) : {};
}

/** Wraps a live transport and saves every response body (unchanged) plus an index entry. */
export function recordingTransport(inner: Transport, dir: string): Transport {
  mkdirSync(dir, { recursive: true });
  const index = readFixtureIndex(dir);
  return async (req) => {
    const res = await inner(req);
    const key = requestKey(req);
    const file = fixtureFileName(key);
    writeFileSync(join(dir, file), JSON.stringify(res.body, null, 2) + "\n");
    index[key] = { file, status: res.status };
    writeFileSync(join(dir, INDEX_FILE), JSON.stringify(index, null, 2) + "\n");
    return res;
  };
}

/** Serves recorded responses. Unknown requests get a 404 with error_code FIXTURE_MISSING. */
export function fixtureTransport(dir: string): Transport {
  let index: FixtureIndex | null = null;
  return async (req) => {
    index ??= readFixtureIndex(dir);
    const key = requestKey(req);
    const hit = index[key];
    if (!hit) {
      return {
        status: 404,
        body: { status: { error_code: "FIXTURE_MISSING", error_message: `No saved response for ${key}` } },
      };
    }
    return { status: hit.status, body: JSON.parse(readFileSync(join(dir, hit.file), "utf8")) };
  };
}
