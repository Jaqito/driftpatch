import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyPatch,
  isCleanWorkingTree,
  revertWorkingTree,
  runValidation,
  summarizeValidationFailures,
  applyAndValidate,
} from "../src/validator/index.js";

const exec = promisify(execFile);

describe("runValidation", () => {
  it("captures stdout, stderr, and exit code from each command", async () => {
    const results = await runValidation(
      [`echo "hello stdout"`, `bash -c 'echo "ouch" >&2; exit 3'`],
      { cwd: process.cwd(), stopOnFirstFailure: false },
    );
    expect(results).toHaveLength(2);
    expect(results[0]?.passed).toBe(true);
    expect(results[0]?.stdout).toContain("hello stdout");
    expect(results[1]?.passed).toBe(false);
    expect(results[1]?.exitCode).toBe(3);
    expect(results[1]?.stderr).toContain("ouch");
  });

  it("stops at the first failure by default", async () => {
    const results = await runValidation([`false`, `echo "should not run"`], {
      cwd: process.cwd(),
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.passed).toBe(false);
  });

  it("times out long-running commands", async () => {
    const results = await runValidation([`sleep 10`], {
      cwd: process.cwd(),
      timeoutMs: 200,
      stopOnFirstFailure: false,
    });
    expect(results[0]?.timedOut).toBe(true);
    expect(results[0]?.passed).toBe(false);
  });

  it("formats failure summary with command, exit code, and output excerpt", () => {
    const summary = summarizeValidationFailures([
      {
        command: "tsc",
        passed: false,
        exitCode: 2,
        stdout: "src/foo.ts(10,5): error TS2304: Cannot find name 'bar'.",
        stderr: "",
        durationMs: 1234,
        timedOut: false,
      },
    ]);
    expect(summary).toContain("Failed: `tsc`");
    expect(summary).toContain("exit 2");
    expect(summary).toContain("Cannot find name 'bar'");
  });
});

describe("applyPatch + revert", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(path.join(tmpdir(), "dp-validator-"));
    await exec("git", ["init", "-q"], { cwd: repoDir });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    await exec("git", ["config", "user.name", "test"], { cwd: repoDir });
    await writeFile(path.join(repoDir, "src.ts"), "export const x = 1;\n");
    await exec("git", ["add", "."], { cwd: repoDir });
    await exec("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("reports a clean working tree, applies a patch, and reverts cleanly", async () => {
    expect(await isCleanWorkingTree(repoDir)).toBe(true);

    const patch = [
      "Index: src.ts",
      "===================================================================",
      "--- src.ts",
      "+++ src.ts",
      "@@ -1 +1 @@",
      "-export const x = 1;",
      "+export const x = 2;",
      "",
    ].join("\n");

    const applied = await applyPatch(repoDir, patch);
    expect(applied.applied).toBe(true);

    expect(await isCleanWorkingTree(repoDir)).toBe(false);

    await revertWorkingTree(repoDir);
    expect(await isCleanWorkingTree(repoDir)).toBe(true);
  });

  it("rejects a malformed patch loudly", async () => {
    const result = await applyPatch(repoDir, "this is not a patch\n");
    expect(result.applied).toBe(false);
    expect(result.message).toContain("git apply");
  });
});

describe("applyAndValidate", () => {
  let repoDir: string;

  beforeEach(async () => {
    repoDir = await mkdtemp(path.join(tmpdir(), "dp-aav-"));
    await exec("git", ["init", "-q"], { cwd: repoDir });
    await exec("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    await exec("git", ["config", "user.name", "test"], { cwd: repoDir });
    await writeFile(path.join(repoDir, "value.txt"), "before\n");
    await exec("git", ["add", "."], { cwd: repoDir });
    await exec("git", ["commit", "-q", "-m", "init"], { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(repoDir, { recursive: true, force: true });
  });

  it("applies, runs validation, and reverts on success", async () => {
    const patch = [
      "Index: value.txt",
      "===================================================================",
      "--- value.txt",
      "+++ value.txt",
      "@@ -1 +1 @@",
      "-before",
      "+after",
      "",
    ].join("\n");

    const result = await applyAndValidate({
      repoPath: repoDir,
      patchText: patch,
      validationCommands: [`grep -q '^after$' value.txt`],
    });

    expect(result.passed).toBe(true);
    expect(result.applyResult.applied).toBe(true);

    expect(await isCleanWorkingTree(repoDir)).toBe(true);
  });

  it("applies, runs validation, reverts on failure, and reports the error", async () => {
    const patch = [
      "Index: value.txt",
      "===================================================================",
      "--- value.txt",
      "+++ value.txt",
      "@@ -1 +1 @@",
      "-before",
      "+after",
      "",
    ].join("\n");

    const result = await applyAndValidate({
      repoPath: repoDir,
      patchText: patch,
      validationCommands: [`bash -c 'echo "FAILURE: bad value" >&2; exit 7'`],
    });

    expect(result.passed).toBe(false);
    expect(result.failureSummary).toContain("FAILURE: bad value");

    expect(await isCleanWorkingTree(repoDir)).toBe(true);
  });

  it("refuses to operate on a dirty working tree", async () => {
    await writeFile(path.join(repoDir, "value.txt"), "uncommitted\n");

    const patch = [
      "Index: value.txt",
      "===================================================================",
      "--- value.txt",
      "+++ value.txt",
      "@@ -1 +1 @@",
      "-uncommitted",
      "+something",
      "",
    ].join("\n");

    const result = await applyAndValidate({
      repoPath: repoDir,
      patchText: patch,
      validationCommands: ["true"],
    });
    expect(result.passed).toBe(false);
    expect(result.applyResult.applied).toBe(false);
    expect(result.applyResult.message).toContain("not clean");
  });
});
