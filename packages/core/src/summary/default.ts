import type { RepoIndex } from "../types.js";
import type {
  CallAffinity,
  LiteralAffinity,
  ProviderSnapshot,
  PropertyValueAffinity,
} from "./types.js";

const SAMPLE_LIMIT = 10;

export interface DefaultSummarizeOptions {
  packages: string[];
  literalPatterns?: RegExp[];
  callRootPatterns?: RegExp[];
  propertyKeyPaths?: string[];
}

export function summarizeProviderDefault(
  name: string,
  index: RepoIndex,
  opts: DefaultSummarizeOptions,
): ProviderSnapshot {
  const filesUsing = collectFilesUsingPackages(index, opts.packages);
  const callSites = collectCallAffinity(index, opts.callRootPatterns ?? []);
  const literals = collectLiteralAffinity(index, opts.literalPatterns ?? []);
  const propertyValues = collectPropertyValueAffinity(index, opts.propertyKeyPaths ?? []);

  return {
    name,
    packages: opts.packages,
    filesUsing,
    affinity: {
      ...(callSites.length > 0 ? { callSites } : {}),
      ...(literals.length > 0 ? { literals } : {}),
      ...(propertyValues.length > 0 ? { propertyValues } : {}),
    },
  };
}

function collectFilesUsingPackages(index: RepoIndex, packages: string[]): string[] {
  const set = new Set<string>();
  for (const pkg of packages) {
    const files = index.filesByPackage.get(pkg);
    if (files) for (const f of files) set.add(f);
  }
  return [...set].sort();
}

function collectCallAffinity(index: RepoIndex, patterns: RegExp[]): CallAffinity[] {
  if (patterns.length === 0) return [];
  const grouped = new Map<string, { sampleFiles: Set<string>; count: number }>();
  for (const call of index.callSites) {
    if (!patterns.some((p) => p.test(call.callee))) continue;
    const entry =
      grouped.get(call.callee) ?? { sampleFiles: new Set<string>(), count: 0 };
    entry.count += 1;
    if (entry.sampleFiles.size < SAMPLE_LIMIT) entry.sampleFiles.add(call.filePath);
    grouped.set(call.callee, entry);
  }
  return [...grouped.entries()]
    .map(([method, e]) => ({ method, sampleFiles: [...e.sampleFiles], count: e.count }))
    .sort((a, b) => b.count - a.count);
}

function collectLiteralAffinity(
  index: RepoIndex,
  patterns: RegExp[],
): LiteralAffinity[] {
  if (patterns.length === 0) return [];
  const grouped = new Map<string, { context: string; sampleFiles: Set<string>; count: number }>();
  for (const lit of index.stringLiterals) {
    if (!patterns.some((p) => p.test(lit.value))) continue;
    const entry =
      grouped.get(lit.value) ?? {
        context: lit.context,
        sampleFiles: new Set<string>(),
        count: 0,
      };
    entry.count += 1;
    if (entry.sampleFiles.size < SAMPLE_LIMIT) entry.sampleFiles.add(lit.filePath);
    grouped.set(lit.value, entry);
  }
  return [...grouped.entries()]
    .map(([value, e]) => ({
      value,
      context: e.context,
      sampleFiles: [...e.sampleFiles],
      count: e.count,
    }))
    .sort((a, b) => b.count - a.count);
}

function collectPropertyValueAffinity(
  index: RepoIndex,
  keyPaths: string[],
): PropertyValueAffinity[] {
  if (keyPaths.length === 0) return [];
  void index;
  // V1: object-property-value affinity is partially covered via string literals
  // with `object_value` context. A proper implementation requires extending the
  // string literal extractor to record the property key. Defer.
  return [];
}
