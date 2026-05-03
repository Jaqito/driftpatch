import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface GitInfo {
  remoteUrl: string | null;
  defaultBranch: string;
  currentBranch: string;
  hasGhCli: boolean;
}

export async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return exec("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 });
}

export async function tryGit(args: string[], cwd: string): Promise<string | null> {
  try {
    const { stdout } = await git(args, cwd);
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function describeRepo(cwd: string): Promise<GitInfo> {
  const remoteUrl = await tryGit(["config", "--get", "remote.origin.url"], cwd);
  const currentBranch = (await tryGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd)) ?? "HEAD";

  let defaultBranch = "main";
  const symRef = await tryGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd);
  if (symRef) {
    const tail = symRef.split("/").pop();
    if (tail) defaultBranch = tail;
  }

  let hasGhCli = false;
  try {
    await exec("gh", ["--version"]);
    hasGhCli = true;
  } catch {
    hasGhCli = false;
  }

  return { remoteUrl, defaultBranch, currentBranch, hasGhCli };
}

export async function createBranch(name: string, cwd: string): Promise<void> {
  await git(["checkout", "-b", name], cwd);
}

export async function commitAll(message: string, cwd: string): Promise<string> {
  await git(["add", "-A"], cwd);
  await git(["commit", "-m", message], cwd);
  const sha = (await tryGit(["rev-parse", "HEAD"], cwd)) ?? "HEAD";
  return sha;
}

export async function pushBranch(branch: string, cwd: string): Promise<void> {
  await git(["push", "-u", "origin", branch], cwd);
}

export async function createPr(
  cwd: string,
  opts: { title: string; body: string; base?: string; draft?: boolean },
): Promise<string> {
  const args = ["pr", "create", "--title", opts.title, "--body", opts.body];
  if (opts.base) args.push("--base", opts.base);
  if (opts.draft) args.push("--draft");
  const { stdout } = await exec("gh", args, { cwd, maxBuffer: 4 * 1024 * 1024 });
  return stdout.trim();
}
