export * from "./types.js";
export type { DriftEngine } from "./engine.js";
export { indexRepo, serializeIndex, deserializeIndex } from "./indexer/index.js";
export type { IndexOptions } from "./indexer/index.js";
export { locate } from "./locator/index.js";
export type { LocatorOptions, ProviderConventionsHint } from "./locator/index.js";
export type {
  AreaSnapshot,
  CallAffinity,
  DirSummary,
  JsxAffinity,
  LiteralAffinity,
  PackageManager,
  PropertyValueAffinity,
  ProviderAffinity,
  ProviderSnapshot,
  RepoLanguage,
  RepoSummary,
  WrapperCandidate,
} from "./summary/types.js";
export { summarizeProviderDefault } from "./summary/default.js";
export type { DefaultSummarizeOptions } from "./summary/default.js";
export { extractRepoSummary } from "./summary/extract.js";
export type { ExtractSummaryOptions, SummaryAdapter } from "./summary/extract.js";
export { draftSkill, SkillDraftSchema } from "./summary/draft.js";
export type { DraftSkillOptions, DraftSkillResult, SkillDraft } from "./summary/draft.js";
export { mergeSkill } from "./summary/merge.js";
export { serializeSkillToMarkdown } from "./summary/serialize.js";
export { loadSkill, parseSkillMarkdown } from "./summary/load.js";
export type { LoadSkillResult } from "./summary/load.js";
