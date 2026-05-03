import type { ChangeEvent } from "@driftpatch/core";

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
}

export function defineAdapter(adapter: ProviderAdapter): ProviderAdapter {
  return adapter;
}

export function isVersionInRange(version: Version, range: string): boolean {
  return version.length > 0 && range.length > 0;
}
