import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  diffSurfaces,
  extractApiSurface,
} from "@driftpatch-example/adapter-polaris";
import { describe, expect, it } from "vitest";
import { captureSnapshot, compareSnapshots, type SnapshotData } from "../src/snapshot.js";
import { polarisAdapter } from "@driftpatch-example/adapter-polaris";

const FIXTURE_REPO = path.join(__dirname, "fixtures", "polaris-app");
const SKILL_PATH = path.join(FIXTURE_REPO, "driftpatch.skill.md");
const SNAPSHOT_DIR = path.join(__dirname, "..", "snapshots");
const SNAPSHOT_PATH = path.join(SNAPSHOT_DIR, "polaris-913ce26d-to-current.json");

const POLARIS_FIXTURES = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "examples",
  "adapter-polaris",
  "fixtures",
);
const OLD_BUNDLE = path.join(POLARIS_FIXTURES, "old.js");
const NEW_BUNDLE = path.join(POLARIS_FIXTURES, "new.js");
const OLD_SHA = "913ce26d86e1755e5b8c29606465c88c2fccf691";
const NEW_SHA = "5ff803d5f82b5b8a4238acb189bfebec198906dc";

describe("Polaris snapshot eval", () => {
  it("matches the checked-in baseline (deterministic adapter+indexer+locator)", async () => {
    const oldText = await readFile(OLD_BUNDLE, "utf8");
    const newText = await readFile(NEW_BUNDLE, "utf8");
    const oldSurface = extractApiSurface(oldText, OLD_SHA, "literal");
    const newSurface = extractApiSurface(newText, NEW_SHA, "literal");
    const events = diffSurfaces(oldSurface, newSurface, {
      fromVersion: OLD_SHA,
      toVersion: NEW_SHA,
    });

    const actual = await captureSnapshot({
      repoPath: FIXTURE_REPO,
      skillPath: SKILL_PATH,
      provider: "polaris",
      events,
      conventions: {
        entityPrefix: polarisAdapter.conventions.entityPrefix ?? "s-",
        namingStyle: polarisAdapter.conventions.namingStyle ?? "kebab",
      },
      providerAliases: ["polaris"],
    });

    if (process.env["UPDATE_SNAPSHOTS"]) {
      await writeFile(SNAPSHOT_PATH, JSON.stringify(actual, null, 2) + "\n");
      console.log(`updated snapshot: ${SNAPSHOT_PATH}`);
      return;
    }

    let expected: SnapshotData;
    try {
      const text = await readFile(SNAPSHOT_PATH, "utf8");
      expected = JSON.parse(text) as SnapshotData;
    } catch {
      throw new Error(
        `snapshot not found at ${SNAPSHOT_PATH}. Run UPDATE_SNAPSHOTS=1 vitest run --filter polaris-snapshot to create it.`,
      );
    }

    const diff = compareSnapshots(actual, expected);
    if (!diff.ok) {
      const message = [
        `snapshot mismatch (${diff.diffs.length} diffs):`,
        ...diff.diffs.map((d) => `  - ${d}`),
        "",
        "If this change is intentional, regenerate with:",
        "  UPDATE_SNAPSHOTS=1 pnpm --filter @driftpatch/eval test",
      ].join("\n");
      throw new Error(message);
    }
    expect(diff.ok).toBe(true);
  });

  it("emits at least the two known additive changes (s-checkbox + s-modal new attrs)", async () => {
    const oldText = await readFile(OLD_BUNDLE, "utf8");
    const newText = await readFile(NEW_BUNDLE, "utf8");
    const oldSurface = extractApiSurface(oldText, OLD_SHA, "literal");
    const newSurface = extractApiSurface(newText, NEW_SHA, "literal");
    const events = diffSurfaces(oldSurface, newSurface, {
      fromVersion: OLD_SHA,
      toVersion: NEW_SHA,
    });

    const entities = events.map((e) => e.entity).sort();
    expect(entities).toContain("s-checkbox[labelaccessibilityvisibility]");
    expect(entities).toContain("s-modal[alignself]");
  });
});
