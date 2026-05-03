import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { diffSurfaces, extractApiSurface } from "../src/index.js";

const FIXTURES = path.join(__dirname, "..", "fixtures");
const OLD_SHA = "913ce26d86e1755e5b8c29606465c88c2fccf691";
const NEW_SHA = "5ff803d5f82b5b8a4238acb189bfebec198906dc";

async function loadSurface(file: string, sha: string) {
  const text = await readFile(path.join(FIXTURES, file), "utf8");
  return extractApiSurface(text, sha, "literal");
}

describe("polaris extractor + differ", () => {
  it("extracts ~62 elements from each fixture bundle without warnings", async () => {
    const oldSurface = await loadSurface("old.js", OLD_SHA);
    const newSurface = await loadSurface("new.js", NEW_SHA);

    expect(oldSurface.elements.size).toBeGreaterThanOrEqual(60);
    expect(newSurface.elements.size).toBeGreaterThanOrEqual(60);
    expect(oldSurface.extractionWarnings).toEqual([]);
    expect(newSurface.extractionWarnings).toEqual([]);
  });

  it("captures full s-button observed attributes including 'loading'", async () => {
    const surface = await loadSurface("new.js", NEW_SHA);
    const button = surface.elements.get("s-button");
    expect(button).toBeDefined();
    expect(button?.observedAttributes).toEqual(
      expect.arrayContaining(["loading", "disabled", "tone", "variant", "href"]),
    );
  });

  it("diffs old → new and finds the known surface additions", async () => {
    const oldSurface = await loadSurface("old.js", OLD_SHA);
    const newSurface = await loadSurface("new.js", NEW_SHA);

    const events = diffSurfaces(oldSurface, newSurface, {
      fromVersion: OLD_SHA,
      toVersion: NEW_SHA,
    });

    const entities = events.map((e) => e.entity).sort();
    expect(entities).toEqual(
      [
        "s-checkbox[labelaccessibilityvisibility]",
        "s-checkbox.labelAccessibilityVisibility",
        "s-modal[alignself]",
        "s-modal.alignSelf",
      ].sort(),
    );

    for (const e of events) {
      expect(e.kind).toBe("addition");
      expect(e.risk).toBe("low");
      expect(e.provider).toBe("polaris");
      expect(e.fromVersion).toBe(OLD_SHA);
      expect(e.toVersion).toBe(NEW_SHA);
    }
  });

  it("diff is empty when old == new", async () => {
    const surface = await loadSurface("new.js", NEW_SHA);
    const events = diffSurfaces(surface, surface, {
      fromVersion: NEW_SHA,
      toVersion: NEW_SHA,
    });
    expect(events).toEqual([]);
  });
});
