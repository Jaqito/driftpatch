import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { RepoIndex } from "../types.js";
import { deserializeIndex, serializeIndex } from "./serialize.js";

export interface RepoSha {
  sha: string;
  dirty: boolean;
}

export function readRepoSha(repoPath: string): RepoSha {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repoPath,
      encoding: "utf8",
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: repoPath,
      encoding: "utf8",
    });
    return { sha, dirty: status.trim().length > 0 };
  } catch {
    return { sha: "no-git", dirty: true };
  }
}

export function cachePathFor(repoPath: string, sha: string): string {
  return path.join(repoPath, ".driftpatch", "cache", `index-${sha}.json`);
}

export async function readCache(filePath: string): Promise<RepoIndex | null> {
  try {
    const text = await readFile(filePath, "utf8");
    return deserializeIndex(JSON.parse(text));
  } catch {
    return null;
  }
}

export async function writeCache(filePath: string, index: RepoIndex): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(serializeIndex(index), null, 2));
}
