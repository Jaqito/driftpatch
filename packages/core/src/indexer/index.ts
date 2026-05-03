import path from "node:path";
import { Project } from "ts-morph";
import type { ImportEdge, JsxUsage, RepoIndex, StringLiteralUsage, SymbolDef } from "../types.js";
import { cachePathFor, readCache, readRepoSha, writeCache } from "./cache.js";
import { buildPackageMap, extractImports } from "./imports.js";
import { extractJsxUsages } from "./jsx.js";
import { extractStringLiterals } from "./strings.js";
import { extractSymbols } from "./symbols.js";

export interface IndexOptions {
  include?: string[];
  exclude?: string[];
  useCache?: boolean;
}

const DEFAULT_INCLUDE = ["**/*.ts", "**/*.tsx"];
const DEFAULT_EXCLUDE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/coverage/**",
  "**/*.d.ts",
];

export async function indexRepo(
  repoPath: string,
  opts: IndexOptions = {},
): Promise<RepoIndex> {
  const absRoot = path.resolve(repoPath);
  const { sha, dirty } = readRepoSha(absRoot);
  const useCache = opts.useCache !== false && !dirty;

  if (useCache) {
    const cached = await readCache(cachePathFor(absRoot, sha));
    if (cached) return cached;
  }

  const project = new Project({
    tsConfigFilePath: findTsConfig(absRoot),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: { allowJs: false, noEmit: true },
  });

  const include = opts.include ?? DEFAULT_INCLUDE;
  const exclude = opts.exclude ?? DEFAULT_EXCLUDE;
  project.addSourceFilesAtPaths([
    ...include.map((g) => path.join(absRoot, g)),
    ...exclude.map((g) => `!${path.join(absRoot, g)}`),
  ]);

  const sources = project.getSourceFiles();
  const files: string[] = [];
  const importsByFile = new Map<string, ImportEdge[]>();
  const symbolsByFile = new Map<string, SymbolDef[]>();
  const jsxUsages: JsxUsage[] = [];
  const stringLiterals: StringLiteralUsage[] = [];

  for (const source of sources) {
    const rel = path.relative(absRoot, source.getFilePath());
    files.push(rel);

    const imports = extractImports(source);
    if (imports.length > 0) importsByFile.set(rel, imports);

    const symbols = extractSymbols(source, rel);
    if (symbols.length > 0) symbolsByFile.set(rel, symbols);

    jsxUsages.push(...extractJsxUsages(source, imports, rel));
    stringLiterals.push(...extractStringLiterals(source, rel));
  }

  const filesByPackage = buildPackageMap(importsByFile);

  const index: RepoIndex = {
    rootPath: absRoot,
    sha,
    dirty,
    files,
    importsByFile,
    filesByPackage,
    symbols: symbolsByFile,
    jsxUsages,
    stringLiterals,
  };

  if (!dirty) {
    await writeCache(cachePathFor(absRoot, sha), index);
  }

  return index;
}

function findTsConfig(repoPath: string): string | undefined {
  const candidate = path.join(repoPath, "tsconfig.json");
  try {
    require("node:fs").accessSync(candidate);
    return candidate;
  } catch {
    return undefined;
  }
}

export { serializeIndex, deserializeIndex } from "./serialize.js";
