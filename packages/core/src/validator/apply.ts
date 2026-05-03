import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface ApplyResult {
  applied: boolean;
  message: string;
}

export async function isCleanWorkingTree(repoPath: string): Promise<boolean> {
  try {
    const { stdout } = await exec("git", ["status", "--porcelain"], { cwd: repoPath });
    return stdout.trim().length === 0;
  } catch {
    return false;
  }
}

export async function applyPatch(
  repoPath: string,
  patchText: string,
): Promise<ApplyResult> {
  if (patchText.trim().length === 0) {
    return { applied: false, message: "patch is empty" };
  }

  const scratchDir = await mkdtemp(path.join(tmpdir(), "driftpatch-apply-"));
  const tmpFile = path.join(scratchDir, "patch.diff");
  await writeFile(tmpFile, patchText);

  try {
    try {
      await exec("git", ["apply", "-p0", "--check", tmpFile], { cwd: repoPath });
    } catch (err) {
      return {
        applied: false,
        message: `git apply --check failed: ${describeExecError(err)}`,
      };
    }

    try {
      await exec("git", ["apply", "-p0", tmpFile], { cwd: repoPath });
      return { applied: true, message: "patch applied" };
    } catch (err) {
      return {
        applied: false,
        message: `git apply failed: ${describeExecError(err)}`,
      };
    }
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}

export async function revertWorkingTree(repoPath: string): Promise<void> {
  await exec("git", ["checkout", "--", "."], { cwd: repoPath });
}

function describeExecError(err: unknown): string {
  if (err instanceof Error) {
    const stderr = (err as { stderr?: string }).stderr;
    if (stderr && stderr.trim().length > 0) return stderr.trim();
    return err.message;
  }
  return String(err);
}
