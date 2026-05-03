import type { ChangeEvent, ProviderSnapshot, RepoIndex } from "@driftpatch/core";

export type Version = string;

export interface ProviderConventions {
  entityPrefix?: string;
  namingStyle?: "kebab" | "camel" | "pascal" | "snake";
  notes?: string;
}

export interface RawChangelog {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface EntityDef {
  name: string;
  version: Version;
  kind: "component" | "function" | "type" | "constant";
  signature?: string;
  attributes?: Record<string, unknown>;
}

export interface ProviderAdapter {
  name: string;
  versionRange: string;
  conventions: ProviderConventions;

  fetchChangelog?(from: Version, to: Version): Promise<RawChangelog>;
  parseChangelog(raw: RawChangelog): Promise<ChangeEvent[]> | ChangeEvent[];
  getEntityDefinition?(name: string, version: Version): EntityDef | null;

  /**
   * Per-provider repo summarization. Inspects the index for evidence of how
   * this provider is consumed in the repo (JSX, call sites, literals, etc).
   * Optional — `summarizeProviderDefault` in @driftpatch/core provides a
   * baseline impl that just lists files importing the package.
   */
  summarize?(index: RepoIndex): ProviderSnapshot;
}

export function defineAdapter(adapter: ProviderAdapter): ProviderAdapter {
  return adapter;
}

export function isVersionInRange(version: Version, range: string): boolean {
  return version.length > 0 && range.length > 0;
}
