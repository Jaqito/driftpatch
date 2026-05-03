export interface ProviderConventionsHint {
  entityPrefix?: string;
  namingStyle?: "kebab" | "camel" | "pascal" | "snake";
  providerNameAliases?: string[];
}

export interface NameVariant {
  candidate: string;
  kind: "direct" | "wrapper";
}

export function computeNameVariants(
  rawEntity: string,
  conv: ProviderConventionsHint = {},
): NameVariant[] {
  const baseName = stripPrefix(rawEntity, conv.entityPrefix);
  const variants: NameVariant[] = [];
  if (rawEntity) variants.push({ candidate: rawEntity, kind: "direct" });
  const pascal = toPascalCase(baseName);
  if (pascal && pascal !== rawEntity) {
    variants.push({ candidate: pascal, kind: "wrapper" });
  }
  return dedupeByCandidate(variants);
}

export function looksLikeProviderImport(
  importSource: string | undefined,
  providerName: string,
  aliases: string[] = [],
): boolean {
  if (!importSource) return false;
  const lowered = importSource.toLowerCase();
  const needles = [providerName.toLowerCase(), ...aliases.map((a) => a.toLowerCase())];
  return needles.some((n) => n.length > 0 && lowered.includes(n));
}

function stripPrefix(entity: string, prefix?: string): string {
  if (!prefix) return entity;
  return entity.startsWith(prefix) ? entity.slice(prefix.length) : entity;
}

function toPascalCase(s: string): string {
  if (!s) return s;
  return s
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join("");
}

function dedupeByCandidate(variants: NameVariant[]): NameVariant[] {
  const seen = new Set<string>();
  const out: NameVariant[] = [];
  for (const v of variants) {
    if (seen.has(v.candidate)) continue;
    seen.add(v.candidate);
    out.push(v);
  }
  return out;
}
