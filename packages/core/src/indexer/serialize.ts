import type { ImportEdge, RepoIndex, SerializedRepoIndex, SymbolDef } from "../types.js";

export function serializeIndex(index: RepoIndex): SerializedRepoIndex {
  return {
    rootPath: index.rootPath,
    sha: index.sha,
    dirty: index.dirty,
    files: index.files,
    importsByFile: mapToRecord(index.importsByFile),
    filesByPackage: mapToRecord(index.filesByPackage),
    symbols: mapToRecord(index.symbols),
    jsxUsages: index.jsxUsages,
    stringLiterals: index.stringLiterals,
  };
}

export function deserializeIndex(json: SerializedRepoIndex): RepoIndex {
  return {
    rootPath: json.rootPath,
    sha: json.sha,
    dirty: json.dirty,
    files: json.files,
    importsByFile: recordToMap<ImportEdge[]>(json.importsByFile),
    filesByPackage: recordToMap<string[]>(json.filesByPackage),
    symbols: recordToMap<SymbolDef[]>(json.symbols),
    jsxUsages: json.jsxUsages,
    stringLiterals: json.stringLiterals,
  };
}

function mapToRecord<V>(map: Map<string, V>): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [k, v] of map) out[k] = v;
  return out;
}

function recordToMap<V>(rec: Record<string, V>): Map<string, V> {
  return new Map(Object.entries(rec));
}
