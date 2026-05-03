import type { ChangeKind, RepoSkill } from "../types.js";
import type { SkillDraft } from "./draft.js";
import type { RepoSummary } from "./types.js";

const DEFAULT_PATCH_POLICY: RepoSkill["patchPolicy"] = {
  rename: "require_review",
  removal: "require_review",
  signature_change: "require_review",
  behavior_change: "require_review",
  new_default: "require_review",
  deprecation: "require_review",
  addition: "require_review",
} satisfies Record<ChangeKind, "require_review">;

export function mergeSkill(summary: RepoSummary, draft: SkillDraft): RepoSkill {
  const providerMappingsByName = new Map<string, RepoSkill["providerMappings"][string]>();

  for (const provider of draft.providerMappings) {
    const entries = provider.entries
      .filter((e) => e.localFile !== null)
      .map((e) => ({
        upstreamEntity: e.upstreamEntity,
        localFile: e.localFile as string,
      }));
    if (entries.length > 0) providerMappingsByName.set(provider.provider, entries);
  }

  const areas = draft.areas.map((a) => ({
    name: a.name,
    paths: [a.path],
    pattern: a.pattern,
  }));

  return {
    version: 1,
    repo: summary.name,
    language: summary.language === "mixed" ? "typescript" : summary.language,
    packageManager: summary.packageManager === "unknown" ? undefined : summary.packageManager,
    validation: { commands: summary.validationCandidates },
    areas,
    providerMappings: Object.fromEntries(providerMappingsByName),
    patchPolicy: DEFAULT_PATCH_POLICY,
    examples: [],
  };
}
