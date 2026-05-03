import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { RepoIndex } from "../types.js";
import type {
  AreaSnapshot,
  DirSummary,
  PackageManager,
  ProviderSnapshot,
  RepoLanguage,
  RepoSummary,
} from "./types.js";

export interface SummaryAdapter {
  name: string;
  summarize?(index: RepoIndex): ProviderSnapshot;
  packagesHint?: string[];
}

export interface ExtractSummaryOptions {
  adapters: SummaryAdapter[];
  maxTopDirs?: number;
  maxAreaSnippets?: number;
}

const DEFAULT_TOP_DIRS = 12;
const DEFAULT_AREA_SNIPPETS = 3;
const VALIDATION_SCRIPT_KEYS = /^(typecheck|tsc|lint|test|check|verify|build)/;
const SKIP_DIRS = new Set([
  "node_modules", "dist", "build", ".next", ".turbo", ".git", "coverage",
  ".driftpatch", ".vercel", ".cache", "out", "tmp",
]);

export async function extractRepoSummary(
  repoPath: string,
  index: RepoIndex,
  opts: ExtractSummaryOptions,
): Promise<RepoSummary> {
  const absRoot = path.resolve(repoPath);
  const pkg = await readPackageJson(absRoot);
  const lockfile = await detectLockfile(absRoot);

  const packageManager = detectPackageManager(pkg, lockfile);
  const language = detectLanguage(index);
  const scripts = pkg.scripts ?? {};
  const validationCandidates = pickValidationCandidates(scripts, packageManager);

  const topDirs = await scanTopDirs(absRoot, index, opts.maxTopDirs ?? DEFAULT_TOP_DIRS);
  const areaCandidates = await collectAreaCandidates(
    absRoot,
    index,
    topDirs,
    opts.maxAreaSnippets ?? DEFAULT_AREA_SNIPPETS,
  );

  const providersDetected = collectProviders(index, opts.adapters);

  return {
    name: pkg.name ?? path.basename(absRoot),
    language,
    packageManager,
    scripts,
    validationCandidates,
    topDirs,
    providersDetected,
    areaCandidates,
  };
}

interface PackageJsonLike {
  name?: string;
  scripts?: Record<string, string>;
  packageManager?: string;
}

async function readPackageJson(repoPath: string): Promise<PackageJsonLike> {
  try {
    const text = await readFile(path.join(repoPath, "package.json"), "utf8");
    return JSON.parse(text) as PackageJsonLike;
  } catch {
    return {};
  }
}

async function detectLockfile(repoPath: string): Promise<string | null> {
  const candidates = ["pnpm-lock.yaml", "bun.lockb", "yarn.lock", "package-lock.json"];
  for (const candidate of candidates) {
    try {
      await stat(path.join(repoPath, candidate));
      return candidate;
    } catch {
      // not present
    }
  }
  return null;
}

function detectPackageManager(pkg: PackageJsonLike, lockfile: string | null): PackageManager {
  if (pkg.packageManager?.startsWith("pnpm")) return "pnpm";
  if (pkg.packageManager?.startsWith("yarn")) return "yarn";
  if (pkg.packageManager?.startsWith("bun")) return "bun";
  if (pkg.packageManager?.startsWith("npm")) return "npm";
  if (lockfile === "pnpm-lock.yaml") return "pnpm";
  if (lockfile === "bun.lockb") return "bun";
  if (lockfile === "yarn.lock") return "yarn";
  if (lockfile === "package-lock.json") return "npm";
  return "unknown";
}

function detectLanguage(index: RepoIndex): RepoLanguage {
  let ts = 0;
  let js = 0;
  for (const f of index.files) {
    if (f.endsWith(".ts") || f.endsWith(".tsx")) ts += 1;
    else if (f.endsWith(".js") || f.endsWith(".jsx") || f.endsWith(".mjs")) js += 1;
  }
  if (ts > 0 && js === 0) return "typescript";
  if (js > 0 && ts === 0) return "javascript";
  if (ts === 0 && js === 0) return "typescript";
  return "mixed";
}

function pickValidationCandidates(
  scripts: Record<string, string>,
  pm: PackageManager,
): string[] {
  const prefix = pm === "unknown" ? "npm run" : pm === "npm" ? "npm run" : pm;
  const out: string[] = [];
  for (const key of Object.keys(scripts).sort()) {
    if (!VALIDATION_SCRIPT_KEYS.test(key)) continue;
    out.push(`${prefix} ${key}`);
  }
  return out;
}

async function scanTopDirs(
  repoPath: string,
  index: RepoIndex,
  limit: number,
): Promise<DirSummary[]> {
  const buckets = new Map<string, DirSummary>();

  for (const file of index.files) {
    if (!file.includes(path.sep)) continue;
    const top = file.split(path.sep)[0] ?? "";
    if (!top || top.startsWith(".")) continue;
    const bucket =
      buckets.get(top) ?? { path: top, tsxFiles: 0, tsFiles: 0, otherFiles: 0 };
    if (file.endsWith(".tsx")) bucket.tsxFiles += 1;
    else if (file.endsWith(".ts")) bucket.tsFiles += 1;
    else bucket.otherFiles += 1;
    buckets.set(top, bucket);
  }

  try {
    const entries = await readdir(repoPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      if (buckets.has(entry.name)) continue;
      buckets.set(entry.name, { path: entry.name, tsxFiles: 0, tsFiles: 0, otherFiles: 0 });
    }
  } catch {
    // ignore
  }

  return [...buckets.values()]
    .sort((a, b) => b.tsxFiles + b.tsFiles - (a.tsxFiles + a.tsFiles))
    .slice(0, limit);
}

async function collectAreaCandidates(
  repoPath: string,
  index: RepoIndex,
  topDirs: DirSummary[],
  snippetLimit: number,
): Promise<AreaSnapshot[]> {
  const out: AreaSnapshot[] = [];
  for (const dir of topDirs) {
    if (dir.tsxFiles + dir.tsFiles === 0) continue;
    const filesInDir = index.files
      .filter((f) => f.startsWith(`${dir.path}${path.sep}`))
      .sort();
    const exampleFiles = filesInDir.slice(0, snippetLimit);
    const exampleSnippets = await Promise.all(
      exampleFiles.map((f) => readSnippet(path.join(repoPath, f))),
    );
    out.push({
      path: dir.path,
      fileCount: filesInDir.length,
      exampleFiles,
      exampleSnippets,
    });
  }
  return out;
}

async function readSnippet(filePath: string, maxLines = 12): Promise<string> {
  try {
    const text = await readFile(filePath, "utf8");
    return text.split("\n").slice(0, maxLines).join("\n");
  } catch {
    return "";
  }
}

function collectProviders(
  index: RepoIndex,
  adapters: SummaryAdapter[],
): ProviderSnapshot[] {
  const out: ProviderSnapshot[] = [];
  for (const adapter of adapters) {
    if (adapter.summarize) {
      const snap = adapter.summarize(index);
      if (snap.filesUsing.length > 0 || hasAffinity(snap)) out.push(snap);
      continue;
    }
    const packages = adapter.packagesHint ?? [];
    if (packages.length === 0) continue;
    const filesUsing = new Set<string>();
    for (const pkg of packages) {
      const files = index.filesByPackage.get(pkg);
      if (files) for (const f of files) filesUsing.add(f);
    }
    if (filesUsing.size === 0) continue;
    out.push({
      name: adapter.name,
      packages,
      filesUsing: [...filesUsing].sort(),
      affinity: {},
    });
  }
  return out;
}

function hasAffinity(snap: ProviderSnapshot): boolean {
  return Boolean(
    snap.affinity.jsx ||
      (snap.affinity.callSites && snap.affinity.callSites.length > 0) ||
      (snap.affinity.literals && snap.affinity.literals.length > 0) ||
      (snap.affinity.propertyValues && snap.affinity.propertyValues.length > 0) ||
      (snap.wrapperCandidates && snap.wrapperCandidates.length > 0),
  );
}
