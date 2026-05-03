import type {
  ChangeEvent,
  Confidence,
  ImpactCandidate,
  RepoIndex,
  RepoSkill,
} from "../types.js";
import {
  computeNameVariants,
  looksLikeProviderImport,
  type ProviderConventionsHint,
} from "./heuristics.js";

export interface LocatorOptions {
  conventions?: ProviderConventionsHint;
  providerAliases?: string[];
  skill?: RepoSkill;
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
  const skillMappedFiles = collectSkillMappedFiles(change, opts.skill);

  const accumulator = new Map<string, CandidateAccumulator>();

  // Skill-mapped wrapper hit — highest confidence; the user has confirmed
  // this file is the canonical local wrapper for this entity.
  for (const filePath of skillMappedFiles) {
    addCandidate(accumulator, filePath, {
      reason: `Skill maps ${elementHint} to ${filePath}`,
      symbol: elementHint,
      confidence: "high",
    });
  }

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
    const importsFromSkillMapped = usage.importSource
      ? [...skillMappedFiles].some((f) =>
          importPointsAtFile(usage.importSource!, usage.filePath, f),
        )
      : false;

    let confidence: Confidence;
    if (matchedVariant.kind === "direct") {
      confidence = "high";
    } else if (importsFromSkillMapped) {
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

function collectSkillMappedFiles(
  change: ChangeEvent,
  skill: RepoSkill | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!skill) return out;
  const mappings = skill.providerMappings[change.provider];
  if (!mappings) return out;

  const elementHint =
    (change.attributes?.["element"] as string | undefined) ?? change.entity;
  for (const mapping of mappings) {
    if (
      mapping.upstreamEntity === elementHint ||
      mapping.upstreamEntity === change.entity ||
      change.entity.startsWith(`${mapping.upstreamEntity}[`) ||
      change.entity.startsWith(`${mapping.upstreamEntity}.`)
    ) {
      out.add(mapping.localFile);
    }
  }
  return out;
}

function importPointsAtFile(
  importSource: string,
  fromFile: string,
  candidateFile: string,
): boolean {
  // Treat path-alias and relative imports as plausibly pointing at the
  // skill-mapped file when the basename or directory matches. Cheap heuristic
  // that's good enough for confidence-upgrading; the run command uses the
  // index for hard answers.
  if (importSource.startsWith(".") || importSource.startsWith("@/") || importSource.startsWith("~/")) {
    const candidateBase = candidateFile.split("/").pop() ?? "";
    const baseWithoutExt = candidateBase.replace(/\.(tsx?|jsx?)$/, "");
    if (importSource.endsWith(`/${baseWithoutExt}`) || importSource.endsWith(baseWithoutExt)) {
      return true;
    }
    const candidateDir = candidateFile.split("/").slice(0, -1).join("/");
    if (candidateDir && importSource.endsWith(candidateDir.split("/").pop() ?? "")) {
      return true;
    }
  }
  void fromFile;
  return false;
}

export type { ProviderConventionsHint } from "./heuristics.js";
