import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexRepo } from "../src/indexer/index.js";

const FIXTURE = path.join(__dirname, "fixtures", "sample-repo");

describe("indexRepo", () => {
  it("indexes the sample repo", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    expect(index.files.sort()).toEqual(
      [
        "src/components/Button.tsx",
        "src/components/Card.tsx",
        "src/handlers/webhook.ts",
        "src/lib/llm.ts",
      ].sort(),
    );
  });

  it("groups files by package, ignoring node builtins and path aliases", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const packages = Array.from(index.filesByPackage.keys()).sort();
    expect(packages).toEqual(
      ["@anthropic-ai/sdk", "@auth0/nextjs-auth0", "@shopify/polaris", "react", "stripe"].sort(),
    );
    expect(index.filesByPackage.get("@shopify/polaris")?.sort()).toEqual([
      "src/components/Button.tsx",
      "src/components/Card.tsx",
    ]);
  });

  it("captures import edges with named imports", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const buttonImports = index.importsByFile.get("src/components/Button.tsx");
    expect(buttonImports).toBeDefined();
    const polarisEdge = buttonImports?.find((e) => e.source === "@shopify/polaris");
    expect(polarisEdge?.importedNames).toContain("Button as PolarisButton");
  });

  it("extracts JSX usages with import source resolution", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const polarisButton = index.jsxUsages.find((u) => u.componentName === "PolarisButton");
    expect(polarisButton).toBeDefined();
    expect(polarisButton?.importSource).toBe("@shopify/polaris");
    expect(polarisButton?.props.map((p) => p.name)).toContain("primary");
  });

  it("extracts symbols including components vs functions vs types", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const buttonSymbols = index.symbols.get("src/components/Button.tsx") ?? [];
    const buttonSym = buttonSymbols.find((s) => s.name === "Button");
    expect(buttonSym?.kind).toBe("component");
    expect(buttonSym?.exported).toBe(true);

    const cardSymbols = index.symbols.get("src/components/Card.tsx") ?? [];
    const cardArrow = cardSymbols.find((s) => s.name === "Card");
    expect(cardArrow?.kind).toBe("component");
    const cardTone = cardSymbols.find((s) => s.name === "CardTone");
    expect(cardTone?.kind).toBe("type");
  });

  it("extracts identifier-like string literals with context", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const webhookStrings = index.stringLiterals.filter(
      (s) => s.filePath === "src/handlers/webhook.ts",
    );
    const eventNames = webhookStrings.map((s) => s.value);
    expect(eventNames).toContain("payment_intent.succeeded");
    expect(eventNames).toContain("checkout.session.completed");
  });

  it("does not include strings inside import statements", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const polarisStringRefs = index.stringLiterals.filter(
      (s) => s.value === "@shopify/polaris",
    );
    expect(polarisStringRefs).toEqual([]);
  });
});
