import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ChangeEvent } from "@driftpatch/core";
import { ChangeEventSchema } from "@driftpatch/core";
import type { ProviderAdapter } from "./index.js";

export interface AdapterFixture {
  name: string;
  changelogPath: string;
  expected: ChangeEvent[];
}

export interface FixtureRunResult {
  fixture: string;
  passed: boolean;
  diffs: string[];
}

export async function runFixture(
  adapter: ProviderAdapter,
  fixture: AdapterFixture,
): Promise<FixtureRunResult> {
  const text = await readFile(fixture.changelogPath, "utf8");
  const actualRaw = await adapter.parseChangelog({ text });
  const actual = actualRaw.map((c) => ChangeEventSchema.parse(c));

  const diffs: string[] = [];
  if (actual.length !== fixture.expected.length) {
    diffs.push(`length mismatch: expected ${fixture.expected.length}, got ${actual.length}`);
  }

  const byEntity = new Map(actual.map((c) => [`${c.entity}:${c.kind}`, c]));
  for (const exp of fixture.expected) {
    const got = byEntity.get(`${exp.entity}:${exp.kind}`);
    if (!got) {
      diffs.push(`missing change: ${exp.entity} (${exp.kind})`);
      continue;
    }
    if (got.fromVersion !== exp.fromVersion || got.toVersion !== exp.toVersion) {
      diffs.push(
        `version mismatch on ${exp.entity}: expected ${exp.fromVersion}->${exp.toVersion}, got ${got.fromVersion}->${got.toVersion}`,
      );
    }
  }

  return { fixture: fixture.name, passed: diffs.length === 0, diffs };
}

export function fixturePath(dir: string, file: string): string {
  return path.join(dir, file);
}
