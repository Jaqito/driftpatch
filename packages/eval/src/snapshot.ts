import { readFile } from "node:fs/promises";
import {
  indexRepo,
  loadSkill,
  locate,
  type ChangeEvent,
  type ImpactCandidate,
  type ProviderConventionsHint,
} from "@driftpatch/core";

export interface SnapshotInput {
  /** Repo-relative or absolute path to the target fixture repo */
  repoPath: string;
  /** Path to driftpatch.skill.md (or any RepoSkill markdown) */
  skillPath: string;
  /** Provider name (e.g. 'polaris', 'stripe') */
  provider: string;
  /** Pre-computed change events for this snapshot. Caller is responsible for
   *  producing them deterministically (e.g. via diffSurfaces on checked-in
   *  bundle fixtures). */
  events: ChangeEvent[];
  /** Adapter conventions for the locator */
  conventions?: ProviderConventionsHint;
  /** Provider-name aliases for fuzzy import-source matching */
  providerAliases?: string[];
}

export interface NormalizedCandidate {
  filePath: string;
  confidence: ImpactCandidate["confidence"];
  matchedSymbols: string[];
  reasonSignals: string[];
}

export interface SnapshotData {
  provider: string;
  events: Array<Pick<ChangeEvent, "id" | "kind" | "entity" | "fromVersion" | "toVersion" | "risk">>;
  locatorByEvent: Record<string, NormalizedCandidate[]>;
}

export async function captureSnapshot(input: SnapshotInput): Promise<SnapshotData> {
  const skillText = await readFile(input.skillPath, "utf8");
  void skillText;
  const { skill } = await loadSkill(input.skillPath);

  const index = await indexRepo(input.repoPath, { useCache: false });

  const locatorByEvent: Record<string, NormalizedCandidate[]> = {};
  for (const event of input.events) {
    const candidates = locate(event, index, {
      ...(input.conventions ? { conventions: input.conventions } : {}),
      ...(input.providerAliases ? { providerAliases: input.providerAliases } : {}),
      skill,
    });
    locatorByEvent[event.id] = candidates.map(normalizeCandidate).sort(byFilePath);
  }

  const eventSummary = input.events
    .map((e) => ({
      id: e.id,
      kind: e.kind,
      entity: e.entity,
      fromVersion: e.fromVersion,
      toVersion: e.toVersion,
      risk: e.risk,
    }))
    .sort((a, b) => a.entity.localeCompare(b.entity) || a.kind.localeCompare(b.kind));

  return {
    provider: input.provider,
    events: eventSummary,
    locatorByEvent,
  };
}

function normalizeCandidate(c: ImpactCandidate): NormalizedCandidate {
  return {
    filePath: c.filePath,
    confidence: c.confidence,
    matchedSymbols: [...c.matchedSymbols].sort(),
    reasonSignals: extractReasonSignals(c.reason),
  };
}

const REASON_SIGNAL_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "skill_mapped", pattern: /^Skill maps /i },
  { key: "jsx_direct", pattern: /^Directly renders /i },
  { key: "jsx_wrapper", pattern: /Renders wrapper /i },
  { key: "string_literal", pattern: /^String literal /i },
  { key: "call_site", pattern: /^Call to /i },
  { key: "new_expression", pattern: /\(new expression\)/i },
];

function extractReasonSignals(reason: string): string[] {
  const out = new Set<string>();
  for (const part of reason.split(";")) {
    for (const sig of REASON_SIGNAL_PATTERNS) {
      if (sig.pattern.test(part.trim())) {
        out.add(sig.key);
        break;
      }
    }
  }
  return [...out].sort();
}

function byFilePath(a: NormalizedCandidate, b: NormalizedCandidate): number {
  return a.filePath.localeCompare(b.filePath);
}

export interface SnapshotDiff {
  ok: boolean;
  diffs: string[];
}

export function compareSnapshots(actual: SnapshotData, expected: SnapshotData): SnapshotDiff {
  const diffs: string[] = [];

  if (actual.provider !== expected.provider) {
    diffs.push(`provider: expected ${expected.provider}, got ${actual.provider}`);
  }

  if (actual.events.length !== expected.events.length) {
    diffs.push(
      `events: expected ${expected.events.length} events, got ${actual.events.length}`,
    );
  }
  const expByEntityKind = new Map(expected.events.map((e) => [`${e.entity}|${e.kind}`, e]));
  for (const e of actual.events) {
    const key = `${e.entity}|${e.kind}`;
    const exp = expByEntityKind.get(key);
    if (!exp) {
      diffs.push(`unexpected event: ${key}`);
      continue;
    }
    if (exp.id !== e.id) {
      diffs.push(`event id changed for ${key}: expected ${exp.id}, got ${e.id}`);
    }
    if (exp.risk !== e.risk) {
      diffs.push(`event risk changed for ${key}: expected ${exp.risk}, got ${e.risk}`);
    }
  }
  for (const exp of expected.events) {
    const key = `${exp.entity}|${exp.kind}`;
    if (!actual.events.some((e) => `${e.entity}|${e.kind}` === key)) {
      diffs.push(`missing event: ${key}`);
    }
  }

  const expIds = new Set(Object.keys(expected.locatorByEvent));
  const actIds = new Set(Object.keys(actual.locatorByEvent));
  for (const id of actIds) {
    if (!expIds.has(id)) diffs.push(`unexpected locator entry: ${id}`);
  }
  for (const id of expIds) {
    if (!actIds.has(id)) {
      diffs.push(`missing locator entry: ${id}`);
      continue;
    }
    const a = actual.locatorByEvent[id]!;
    const x = expected.locatorByEvent[id]!;
    if (a.length !== x.length) {
      diffs.push(`locator count for ${id}: expected ${x.length}, got ${a.length}`);
    }
    const expByPath = new Map(x.map((c) => [c.filePath, c]));
    for (const c of a) {
      const exp = expByPath.get(c.filePath);
      if (!exp) {
        diffs.push(`unexpected candidate for ${id}: ${c.filePath}`);
        continue;
      }
      if (exp.confidence !== c.confidence) {
        diffs.push(
          `confidence drift for ${id}/${c.filePath}: expected ${exp.confidence}, got ${c.confidence}`,
        );
      }
      const expSigs = exp.reasonSignals.join(",");
      const actSigs = c.reasonSignals.join(",");
      if (expSigs !== actSigs) {
        diffs.push(
          `reason signals drift for ${id}/${c.filePath}: expected [${expSigs}], got [${actSigs}]`,
        );
      }
    }
    for (const exp of x) {
      if (!a.some((c) => c.filePath === exp.filePath)) {
        diffs.push(`missing candidate for ${id}: ${exp.filePath}`);
      }
    }
  }

  return { ok: diffs.length === 0, diffs };
}
