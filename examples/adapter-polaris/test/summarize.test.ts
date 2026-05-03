import path from "node:path";
import { indexRepo } from "@driftpatch/core";
import { describe, expect, it } from "vitest";
import { summarizePolaris } from "../src/summarize.js";

const FIXTURE = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "packages",
  "core",
  "test",
  "fixtures",
  "sample-repo",
);

describe("summarizePolaris", () => {
  it("emits a snapshot keyed on the polaris provider name", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const snap = summarizePolaris(index);
    expect(snap.name).toBe("polaris");
    expect(snap.packages).toEqual(["@shopify/polaris"]);
  });

  it("lists files importing @shopify/polaris directly", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const snap = summarizePolaris(index);
    expect(snap.filesUsing.sort()).toEqual([
      "src/components/Button.tsx",
      "src/components/Card.tsx",
    ]);
  });

  it("captures JSX affinity from polaris-imported components", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const snap = summarizePolaris(index);
    expect(snap.affinity.jsx).toBeDefined();
    expect(snap.affinity.jsx?.components).toContain("PolarisButton");
    expect(snap.affinity.jsx?.components).toContain("PolarisCard");
  });

  it("derives wrapper candidates per s-* element from JSX usage + exports", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const snap = summarizePolaris(index);
    expect(snap.wrapperCandidates).toBeDefined();

    const sButton = snap.wrapperCandidates?.find((w) => w.upstreamEntity === "s-button");
    expect(sButton).toBeDefined();
    expect(sButton?.candidates[0]?.file).toBe("src/components/Button.tsx");
    expect(sButton?.candidates[0]?.exports).toContain("Button");

    const sCard = snap.wrapperCandidates?.find((w) => w.upstreamEntity === "s-card");
    expect(sCard?.candidates[0]?.file).toBe("src/components/Card.tsx");
  });
});
