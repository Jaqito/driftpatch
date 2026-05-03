import {
  applyPatch,
  isCleanWorkingTree,
  revertWorkingTree,
  type ApplyResult,
} from "./apply.js";
import {
  runValidation,
  summarizeValidationFailures,
  type RunValidationOptions,
  type ValidationStepResult,
} from "./run.js";

export interface ApplyAndValidateInput {
  repoPath: string;
  patchText: string;
  validationCommands: string[];
  requireCleanTree?: boolean;
  validationOptions?: Partial<RunValidationOptions>;
}

export interface ApplyAndValidateResult {
  passed: boolean;
  applyResult: ApplyResult;
  validation: ValidationStepResult[];
  failureSummary: string;
}

export async function applyAndValidate(
  input: ApplyAndValidateInput,
): Promise<ApplyAndValidateResult> {
  if (input.requireCleanTree !== false) {
    const clean = await isCleanWorkingTree(input.repoPath);
    if (!clean) {
      return {
        passed: false,
        applyResult: {
          applied: false,
          message:
            "working tree is not clean. Commit or stash changes before validating, or pass --no-require-clean-tree.",
        },
        validation: [],
        failureSummary: "working tree dirty",
      };
    }
  }

  const applyResult = await applyPatch(input.repoPath, input.patchText);
  if (!applyResult.applied) {
    return {
      passed: false,
      applyResult,
      validation: [],
      failureSummary: applyResult.message,
    };
  }

  let validation: ValidationStepResult[] = [];
  try {
    validation = await runValidation(input.validationCommands, {
      cwd: input.repoPath,
      stopOnFirstFailure: true,
      ...input.validationOptions,
    });
  } finally {
    await revertWorkingTree(input.repoPath);
  }

  const passed = validation.every((s) => s.passed);
  return {
    passed,
    applyResult,
    validation,
    failureSummary: passed ? "" : summarizeValidationFailures(validation),
  };
}

export {
  runValidation,
  summarizeValidationFailures,
  type ValidationStepResult,
  type RunValidationOptions,
} from "./run.js";
export {
  applyPatch,
  revertWorkingTree,
  isCleanWorkingTree,
  type ApplyResult,
} from "./apply.js";
