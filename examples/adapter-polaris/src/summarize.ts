import { summarizeProviderDefault } from "@driftpatch/core";
import type { JsxUsage, ProviderSnapshot, RepoIndex, WrapperCandidate } from "@driftpatch/core";

const SAMPLE_LIMIT = 10;
const POLARIS_PACKAGES = ["@shopify/polaris"];
const POLARIS_PATH_HINTS = /polaris/i;

export function summarizePolaris(index: RepoIndex): ProviderSnapshot {
  const baseline = summarizeProviderDefault("polaris", index, {
    packages: POLARIS_PACKAGES,
  });

  const polarisJsx = collectPolarisJsx(index);
  const wrapperCandidates = buildWrapperCandidates(index, polarisJsx);

  return {
    ...baseline,
    affinity: {
      ...baseline.affinity,
      ...(polarisJsx.usages.length > 0
        ? {
            jsx: {
              components: dedupeSorted(polarisJsx.usages.map((u) => u.componentName)),
              sampleFiles: dedupeSorted(polarisJsx.usages.map((u) => u.filePath)).slice(0, SAMPLE_LIMIT),
            },
          }
        : {}),
    },
    ...(wrapperCandidates.length > 0 ? { wrapperCandidates } : {}),
  };
}

interface PolarisJsxBucket {
  usages: JsxUsage[];
  byKebabName: Map<string, JsxUsage[]>;
}

function collectPolarisJsx(index: RepoIndex): PolarisJsxBucket {
  const usages: JsxUsage[] = [];
  const byKebabName = new Map<string, JsxUsage[]>();

  for (const usage of index.jsxUsages) {
    const isDirectKebab = usage.componentName.startsWith("s-");
    const isLikelyWrapper =
      !!usage.importSource &&
      (POLARIS_PATH_HINTS.test(usage.importSource) ||
        POLARIS_PACKAGES.some((p) => usage.importSource === p));

    if (!isDirectKebab && !isLikelyWrapper) continue;
    usages.push(usage);

    const kebabName = isDirectKebab
      ? usage.componentName
      : `s-${camelToKebab(usage.originalName ?? usage.componentName)}`;
    const list = byKebabName.get(kebabName) ?? [];
    list.push(usage);
    byKebabName.set(kebabName, list);
  }

  return { usages, byKebabName };
}

function buildWrapperCandidates(
  index: RepoIndex,
  bucket: PolarisJsxBucket,
): WrapperCandidate[] {
  const wrappersByElement = new Map<string, Map<string, { exports: Set<string>; score: number }>>();

  for (const [kebabName, usages] of bucket.byKebabName) {
    for (const usage of usages) {
      if (usage.componentName.startsWith("s-")) continue;
      const exportName = usage.originalName ?? usage.componentName;
      const exportingFiles = findFilesExporting(index, exportName);

      const filesMap = wrappersByElement.get(kebabName) ?? new Map();
      for (const file of exportingFiles) {
        const entry = filesMap.get(file) ?? { exports: new Set<string>(), score: 0 };
        entry.exports.add(exportName);
        entry.score += scoreCandidate(file, usage.importSource);
        filesMap.set(file, entry);
      }
      wrappersByElement.set(kebabName, filesMap);
    }
  }

  const candidates: WrapperCandidate[] = [];
  for (const [upstreamEntity, filesMap] of wrappersByElement) {
    const entries = [...filesMap.entries()]
      .map(([file, e]) => ({
        file,
        exports: [...e.exports].sort(),
        score: round(e.score),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (entries.length === 0) continue;
    candidates.push({ upstreamEntity, candidates: entries });
  }
  return candidates.sort((a, b) => a.upstreamEntity.localeCompare(b.upstreamEntity));
}

function findFilesExporting(index: RepoIndex, exportName: string): string[] {
  const out: string[] = [];
  for (const [file, syms] of index.symbols) {
    if (syms.some((s) => s.name === exportName && s.exported)) out.push(file);
  }
  return out;
}

function scoreCandidate(file: string, importSource: string | undefined): number {
  let score = 0.4;
  if (POLARIS_PATH_HINTS.test(file)) score += 0.4;
  if (file.includes("/primitives/")) score += 0.3;
  if (importSource && POLARIS_PATH_HINTS.test(importSource)) score += 0.2;
  if (file.endsWith(".stories.tsx") || file.endsWith(".test.tsx")) score -= 0.5;
  return Math.max(0, score);
}

function camelToKebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function dedupeSorted(arr: string[]): string[] {
  return [...new Set(arr)].sort();
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
