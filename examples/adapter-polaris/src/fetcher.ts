import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BundleRef } from "./types.js";

const CDN_URL = "https://cdn.shopify.com/shopifycloud/polaris.js";
const ARCHIVE_URL = (sha: string) => `https://polaris-changelog.dev/builds/${sha}.js`;

const SHA_RE = /^\/\*!([a-f0-9]+)\*\//;

export interface FetchOptions {
  cacheDir?: string;
}

export async function fetchBundle(sha: string, opts: FetchOptions = {}): Promise<BundleRef> {
  if (sha === "current") return fetchCurrent(opts);
  return fetchArchived(sha, opts);
}

async function fetchCurrent(opts: FetchOptions): Promise<BundleRef> {
  const text = await fetchText(CDN_URL);
  const sha = extractBundleSha(text) ?? "current";
  if (opts.cacheDir) await writeCached(opts.cacheDir, sha, text);
  return { sha, text, source: "cdn" };
}

async function fetchArchived(sha: string, opts: FetchOptions): Promise<BundleRef> {
  if (opts.cacheDir) {
    const cached = await readCached(opts.cacheDir, sha);
    if (cached) return { sha, text: cached, source: "cache" };
  }
  const text = await fetchText(ARCHIVE_URL(sha));
  if (opts.cacheDir) await writeCached(opts.cacheDir, sha, text);
  return { sha, text, source: "archive" };
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} (${res.status})`);
  return res.text();
}

export function extractBundleSha(text: string): string | null {
  const match = SHA_RE.exec(text);
  return match?.[1] ?? null;
}

async function readCached(cacheDir: string, sha: string): Promise<string | null> {
  try {
    return await readFile(path.join(cacheDir, `${sha}.js`), "utf8");
  } catch {
    return null;
  }
}

async function writeCached(cacheDir: string, sha: string, text: string): Promise<void> {
  await mkdir(cacheDir, { recursive: true });
  await writeFile(path.join(cacheDir, `${sha}.js`), text);
}
