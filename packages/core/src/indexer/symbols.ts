import type { SourceFile, VariableDeclaration } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { SymbolDef } from "../types.js";

export function extractSymbols(source: SourceFile, filePath: string): SymbolDef[] {
  const out: SymbolDef[] = [];

  for (const fn of source.getFunctions()) {
    const name = fn.getName();
    if (!name) continue;
    out.push({
      name,
      kind: looksLikeComponent(name, fn.getReturnTypeNodeOrThrow.bind(fn)) ? "component" : "function",
      filePath,
      line: fn.getStartLineNumber(),
      exported: fn.isExported(),
    });
  }

  for (const cls of source.getClasses()) {
    const name = cls.getName();
    if (!name) continue;
    out.push({
      name,
      kind: "class",
      filePath,
      line: cls.getStartLineNumber(),
      exported: cls.isExported(),
    });
  }

  for (const iface of source.getInterfaces()) {
    out.push({
      name: iface.getName(),
      kind: "interface",
      filePath,
      line: iface.getStartLineNumber(),
      exported: iface.isExported(),
    });
  }

  for (const alias of source.getTypeAliases()) {
    out.push({
      name: alias.getName(),
      kind: "type",
      filePath,
      line: alias.getStartLineNumber(),
      exported: alias.isExported(),
    });
  }

  for (const variable of source.getVariableStatements()) {
    const exported = variable.isExported();
    for (const decl of variable.getDeclarations()) {
      const name = decl.getName();
      if (!name) continue;
      out.push({
        name,
        kind: detectVariableKind(decl),
        filePath,
        line: decl.getStartLineNumber(),
        exported,
      });
    }
  }

  return out;
}

function detectVariableKind(decl: VariableDeclaration): SymbolDef["kind"] {
  const init = decl.getInitializer();
  if (!init) return "variable";
  const kind = init.getKind();
  if (
    kind === SyntaxKind.ArrowFunction ||
    kind === SyntaxKind.FunctionExpression
  ) {
    return looksLikePascal(decl.getName()) ? "component" : "function";
  }
  return "variable";
}

function looksLikePascal(name: string): boolean {
  const first = name[0];
  return !!first && first === first.toUpperCase() && first !== first.toLowerCase();
}

function looksLikeComponent(name: string, _getReturnType: unknown): boolean {
  return looksLikePascal(name);
}
