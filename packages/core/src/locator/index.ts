import type { ChangeEvent, Confidence, ImpactCandidate, RepoIndex } from "../types.js";
import {
  computeNameVariants,
  looksLikeProviderImport,
  type ProviderConventionsHint,
} from "./heuristics.js";

export interface LocatorOptions {
  conventions?: ProviderConventionsHint;
  providerAliases?: string[];
}

interface CandidateAccumulator {
  reasons: Set<string>;
  symbols: Set<string>;
  confidence: Confidence;
}

export function locate(
  change: ChangeEvent,
  index: RepoIndex,
  opts: LocatorOptions = {},
): ImpactCandidate[] {
  const elementHint =
    (change.attributes?.["element"] as string | undefined) ?? change.entity;
  if (!elementHint) return [];

  const variants = computeNameVariants(elementHint, opts.conventions);
  const conv = opts.conventions ?? {};
  const aliases = opts.providerAliases ?? [];

  const accumulator = new Map<string, CandidateAccumulator>();

  for (const usage of index.jsxUsages) {
    const matchedVariant = variants.find(
      (v) => v.candidate === usage.componentName || v.candidate === usage.originalName,
    );
    if (!matchedVariant) continue;

    const isProviderImport = looksLikeProviderImport(
      usage.importSource,
      change.provider,
      aliases,
    );

    let confidence: Confidence;
    if (matchedVariant.kind === "direct") {
      confidence = "high";
    } else if (isProviderImport) {
      confidence = "high";
    } else {
      confidence = "low";
    }

    const sourceClause = usage.importSource ? ` (from ${usage.importSource})` : "";
    const aliasClause =
      usage.originalName && usage.originalName !== usage.componentName
        ? ` aliased from ${usage.originalName}`
        : "";
    const reason =
      matchedVariant.kind === "direct"
        ? `Directly renders <${usage.componentName}>${aliasClause}${sourceClause} on line ${usage.line}`
        : `Renders wrapper <${usage.componentName}>${aliasClause}${sourceClause} on line ${usage.line} — derived name match for ${elementHint}`;

    addCandidate(accumulator, usage.filePath, {
      reason,
      symbol: usage.componentName,
      confidence,
    });
  }

  // String literal hits (e.g. webhook/event names referenced as strings).
  for (const lit of index.stringLiterals) {
    if (lit.value !== elementHint) continue;
    addCandidate(accumulator, lit.filePath, {
      reason: `String literal "${lit.value}" appears on line ${lit.line} (${lit.context})`,
      symbol: lit.value,
      confidence: "medium",
    });
  }
  void conv;

  return [...accumulator]
    .map(([filePath, acc]) => ({
      filePath,
      reason: [...acc.reasons].join("; "),
      confidence: acc.confidence,
      matchedSymbols: [...acc.symbols],
    }))
    .sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function addCandidate(
  acc: Map<string, CandidateAccumulator>,
  filePath: string,
  entry: { reason: string; symbol: string; confidence: Confidence },
): void {
  let existing = acc.get(filePath);
  if (!existing) {
    existing = { reasons: new Set(), symbols: new Set(), confidence: entry.confidence };
    acc.set(filePath, existing);
  }
  existing.reasons.add(entry.reason);
  existing.symbols.add(entry.symbol);
  existing.confidence = upgradeConfidence(existing.confidence, entry.confidence);
}

function upgradeConfidence(a: Confidence, b: Confidence): Confidence {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[a] >= rank[b] ? a : b;
}

export type { ProviderConventionsHint } from "./heuristics.js";
