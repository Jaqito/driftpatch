import type { ChangeEvent } from "@driftpatch/core";

export interface EvalCase {
  name: string;
  provider: string;
  changelogPath: string;
  repoFixturePath: string;
  expectedChanges: ChangeEvent[];
  expectedFiles: string[];
  knownGoodPatchPath?: string;
}

export interface GraderResult {
  caseName: string;
  classifyScore: number;
  locateScore: number;
  patchApplies: boolean;
  validationPassed: boolean;
  notes: string[];
}

export async function gradeCase(_c: EvalCase): Promise<GraderResult> {
  return {
    caseName: _c.name,
    classifyScore: 0,
    locateScore: 0,
    patchApplies: false,
    validationPassed: false,
    notes: ["grader not implemented"],
  };
}
