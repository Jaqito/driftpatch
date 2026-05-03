import type { SourceFile } from "ts-morph";
import type { ImportEdge } from "../types.js";

export function extractImports(source: SourceFile): ImportEdge[] {
  const edges: ImportEdge[] = [];

  for (const decl of source.getImportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    const isTypeOnly = decl.isTypeOnly();
    const importedNames: string[] = [];

    const defaultImport = decl.getDefaultImport();
    if (defaultImport) importedNames.push(`default as ${defaultImport.getText()}`);

    const namespaceImport = decl.getNamespaceImport();
    if (namespaceImport) importedNames.push(`* as ${namespaceImport.getText()}`);

    for (const named of decl.getNamedImports()) {
      const name = named.getName();
      const alias = named.getAliasNode()?.getText();
      importedNames.push(alias ? `${name} as ${alias}` : name);
    }

    edges.push({
      source: moduleSpecifier,
      importedNames,
      isTypeOnly,
      line: decl.getStartLineNumber(),
    });
  }

  for (const decl of source.getExportDeclarations()) {
    const moduleSpecifier = decl.getModuleSpecifierValue();
    if (!moduleSpecifier) continue;
    const named = decl.getNamedExports().map((n) => {
      const alias = n.getAliasNode()?.getText();
      return alias ? `${n.getName()} as ${alias}` : n.getName();
    });
    edges.push({
      source: moduleSpecifier,
      importedNames: named.length > 0 ? named : ["*"],
      isTypeOnly: decl.isTypeOnly(),
      line: decl.getStartLineNumber(),
    });
  }

  return edges;
}

export function buildPackageMap(
  importsByFile: Map<string, ImportEdge[]>,
): Map<string, string[]> {
  const packageMap = new Map<string, string[]>();
  for (const [file, edges] of importsByFile) {
    for (const edge of edges) {
      const pkg = packageOf(edge.source);
      if (!pkg) continue;
      const list = packageMap.get(pkg);
      if (list) {
        if (!list.includes(file)) list.push(file);
      } else {
        packageMap.set(pkg, [file]);
      }
    }
  }
  return packageMap;
}

const NODE_BUILTINS = new Set([
  "fs", "path", "os", "url", "util", "crypto", "child_process", "stream",
  "events", "buffer", "querystring", "http", "https", "net", "tls", "zlib",
  "assert", "console", "process", "module", "vm", "worker_threads",
]);

function packageOf(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.startsWith("node:")) return null;
  if (specifier.startsWith("@/") || specifier.startsWith("~/")) return null;
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    if (parts.length < 2) return null;
    const scope = parts[0];
    if (!scope || scope === "@") return null;
    return `${parts[0]}/${parts[1]}`;
  }
  const root = specifier.split("/")[0] ?? null;
  if (root && NODE_BUILTINS.has(root)) return null;
  return root;
}
