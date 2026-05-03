import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexRepo } from "../src/indexer/index.js";
import { locate } from "../src/locator/index.js";
import type { ChangeEvent } from "../src/types.js";

const FIXTURE = path.join(__dirname, "fixtures", "sample-repo");

const polarisConventions = {
  entityPrefix: "s-",
  namingStyle: "kebab" as const,
};

function event(overrides: Partial<ChangeEvent>): ChangeEvent {
  return {
    id: "test",
    provider: "polaris",
    kind: "addition",
    entity: "s-button",
    fromVersion: "a",
    toVersion: "b",
    description: "test event",
    risk: "low",
    ...overrides,
  };
}

describe("locate", () => {
  it("finds wrapper components imported from a polaris-named source", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const change = event({
      entity: "s-button[loading]",
      attributes: { element: "s-button", attribute: "loading" },
    });
    const candidates = locate(change, index, { conventions: polarisConventions });

    expect(candidates.map((c) => c.filePath)).toContain("src/components/Button.tsx");
    const buttonHit = candidates.find((c) => c.filePath === "src/components/Button.tsx");
    expect(buttonHit?.confidence).toBe("high");
    expect(buttonHit?.matchedSymbols).toContain("PolarisButton");
  });

  it("finds direct kebab-case usage with high confidence", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    // Synthesize an "s-button" usage isn't in the fixture, but PolarisButton
    // (imported `as PolarisButton` from @shopify/polaris) is — locator should
    // upgrade confidence because the import source contains "polaris".
    const change = event({ attributes: { element: "s-button" } });
    const candidates = locate(change, index, { conventions: polarisConventions });
    const buttonHit = candidates.find((c) => c.filePath === "src/components/Button.tsx");
    expect(buttonHit?.confidence).toBe("high");
  });

  it("returns no candidates when nothing matches", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const change = event({ attributes: { element: "s-noexist" } });
    const candidates = locate(change, index, { conventions: polarisConventions });
    expect(candidates).toEqual([]);
  });

  it("matches webhook-style string literals when the entity hint is the literal", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const change = event({
      provider: "stripe",
      kind: "rename",
      entity: "payment_intent.succeeded",
      attributes: { element: "payment_intent.succeeded" },
    });
    const candidates = locate(change, index);
    expect(candidates.map((c) => c.filePath)).toContain("src/handlers/webhook.ts");
  });

  it("captures human-readable reasons including line numbers", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const change = event({ attributes: { element: "s-card" } });
    const candidates = locate(change, index, { conventions: polarisConventions });
    const cardHit = candidates.find((c) => c.filePath === "src/components/Card.tsx");
    expect(cardHit).toBeDefined();
    expect(cardHit?.reason).toMatch(/line \d+/);
    expect(cardHit?.reason).toMatch(/PolarisCard/);
  });
});
