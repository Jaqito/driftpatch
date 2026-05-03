import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CallSite, ImportEdge } from "../types.js";

export function extractCallSites(
  source: SourceFile,
  imports: ImportEdge[],
  filePath: string,
): CallSite[] {
  const lookup = buildImportLookup(imports);
  const out: CallSite[] = [];

  source.forEachDescendant((node) => {
    const callOrNew = pickCallOrNew(node);
    if (!callOrNew) return;

    const callee = extractCalleeChain(callOrNew.expression);
    if (!callee) return;

    const rootIdentifier = callee.split(".")[0]!;
    const importSource = lookup.get(rootIdentifier);

    out.push({
      filePath,
      line: callOrNew.node.getStartLineNumber(),
      callee,
      rootIdentifier,
      ...(importSource ? { importSource } : {}),
      argCount: callOrNew.argCount,
      isNew: callOrNew.isNew,
    });
  });

  return out;
}

interface CallLike {
  node: Node;
  expression: Node;
  argCount: number;
  isNew: boolean;
}

function pickCallOrNew(node: Node): CallLike | null {
  const call = node.asKind(SyntaxKind.CallExpression);
  if (call) {
    return {
      node: call,
      expression: call.getExpression(),
      argCount: call.getArguments().length,
      isNew: false,
    };
  }
  const newExpr = node.asKind(SyntaxKind.NewExpression);
  if (newExpr) {
    return {
      node: newExpr,
      expression: newExpr.getExpression(),
      argCount: newExpr.getArguments().length,
      isNew: true,
    };
  }
  return null;
}

function extractCalleeChain(expr: Node): string | null {
  const ident = expr.asKind(SyntaxKind.Identifier);
  if (ident) return ident.getText();

  const propAccess = expr.asKind(SyntaxKind.PropertyAccessExpression);
  if (propAccess) {
    const left = extractCalleeChain(propAccess.getExpression());
    if (!left) return null;
    return `${left}.${propAccess.getName()}`;
  }

  // call().foo() — trailing chain after a call result; pick up the property names only
  const elementAccess = expr.asKind(SyntaxKind.ElementAccessExpression);
  if (elementAccess) {
    const left = extractCalleeChain(elementAccess.getExpression());
    if (!left) return null;
    const argText = elementAccess.getArgumentExpression()?.getText() ?? "?";
    return `${left}[${argText}]`;
  }

  return null;
}

function buildImportLookup(imports: ImportEdge[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const edge of imports) {
    for (const raw of edge.importedNames) {
      const localName = parseLocalName(raw);
      if (localName) lookup.set(localName, edge.source);
    }
  }
  return lookup;
}

function parseLocalName(spec: string): string | null {
  const asMatch = /\sas\s+([A-Za-z_$][\w$]*)$/.exec(spec);
  if (asMatch) return asMatch[1] ?? null;
  if (spec === "*" || spec === "default") return null;
  return spec;
}
