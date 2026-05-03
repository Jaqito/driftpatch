import path from "node:path";
import { describe, expect, it } from "vitest";
import { indexRepo } from "../src/indexer/index.js";

const FIXTURE = path.join(__dirname, "fixtures", "sample-repo");

describe("call-site extraction", () => {
  it("captures direct single-name calls from imported identifiers", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const llmCalls = index.callSites.filter((c) => c.filePath === "src/lib/llm.ts");
    const auth = llmCalls.find((c) => c.callee === "withApiAuthRequired");
    expect(auth).toBeDefined();
    expect(auth?.importSource).toBe("@auth0/nextjs-auth0");
    expect(auth?.argCount).toBe(1);
    expect(auth?.isNew).toBe(false);
  });

  it("captures `new` expressions for imported classes", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const llmCalls = index.callSites.filter((c) => c.filePath === "src/lib/llm.ts");
    const stripeNew = llmCalls.find((c) => c.callee === "Stripe" && c.isNew);
    expect(stripeNew).toBeDefined();
    expect(stripeNew?.importSource).toBe("stripe");
    expect(stripeNew?.argCount).toBe(1);
  });

  it("captures chained property access calls and the rooted import source", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const llmCalls = index.callSites.filter((c) => c.filePath === "src/lib/llm.ts");

    const checkout = llmCalls.find((c) => c.callee === "stripe.checkout.sessions.create");
    expect(checkout).toBeDefined();
    expect(checkout?.rootIdentifier).toBe("stripe");
    // 'stripe' here is a local const, not the import (the import is the
    // class `Stripe`), so importSource is undefined — known V1 limitation
    // for the constructor-then-method pattern.
    expect(checkout?.importSource).toBeUndefined();
  });

  it("for the constructor-then-method case, root identifier is the local var", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const llmCalls = index.callSites.filter((c) => c.filePath === "src/lib/llm.ts");
    const messages = llmCalls.find((c) => c.callee === "client.messages.create");
    expect(messages).toBeDefined();
    expect(messages?.rootIdentifier).toBe("client");
  });

  it("does not surface importSource for purely-local function calls", async () => {
    const index = await indexRepo(FIXTURE, { useCache: false });
    const webhookCalls = index.callSites.filter(
      (c) => c.filePath === "src/handlers/webhook.ts",
    );
    const proc = webhookCalls.find((c) => c.callee === "processPayment");
    expect(proc).toBeDefined();
    expect(proc?.importSource).toBeUndefined();
  });
});
