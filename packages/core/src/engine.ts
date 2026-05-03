import type {
  ApplyResult,
  ChangeEvent,
  ImpactCandidate,
  PatchPlan,
  ProposedPatch,
  RepoIndex,
  RepoSkill,
  ValidationResult,
} from "./types.js";

export interface RawChangelog {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface DriftEngine {
  classify(raw: RawChangelog, providerName: string): Promise<ChangeEvent[]>;
  indexRepo(repoPath: string): Promise<RepoIndex>;
  locate(
    change: ChangeEvent,
    index: RepoIndex,
    skill: RepoSkill,
  ): Promise<ImpactCandidate[]>;
  plan(
    change: ChangeEvent,
    candidates: ImpactCandidate[],
    skill: RepoSkill,
  ): Promise<PatchPlan>;
  patch(plan: PatchPlan, index: RepoIndex): Promise<ProposedPatch>;
  validate(patch: ProposedPatch, skill: RepoSkill): Promise<ValidationResult>;
  apply(patch: ProposedPatch, opts: { openPr?: boolean }): Promise<ApplyResult>;
}
