import type { Node, SourceFile, StringLiteral } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { StringLiteralContext, StringLiteralUsage } from "../types.js";

const MIN_LENGTH = 3;
const IDENTIFIER_LIKE = /^[a-z][a-z0-9_.]*$/i;

export function extractStringLiterals(
  source: SourceFile,
  filePath: string,
): StringLiteralUsage[] {
  const out: StringLiteralUsage[] = [];

  source.forEachDescendant((node) => {
    const lit = node.asKind(SyntaxKind.StringLiteral);
    if (!lit) return;

    const value = lit.getLiteralText();
    if (value.length < MIN_LENGTH) return;
    if (!IDENTIFIER_LIKE.test(value)) return;
    if (isInsideImport(lit)) return;

    out.push({
      filePath,
      line: lit.getStartLineNumber(),
      value,
      context: classifyContext(lit),
    });
  });

  return out;
}

function isInsideImport(node: Node): boolean {
  let parent: Node | undefined = node.getParent();
  while (parent) {
    const kind = parent.getKind();
    if (
      kind === SyntaxKind.ImportDeclaration ||
      kind === SyntaxKind.ExportDeclaration ||
      kind === SyntaxKind.ImportEqualsDeclaration
    ) {
      return true;
    }
    parent = parent.getParent();
  }
  return false;
}

function classifyContext(lit: StringLiteral): StringLiteralContext {
  const parent = lit.getParent();
  if (!parent) return "other";
  const kind = parent.getKind();
  switch (kind) {
    case SyntaxKind.CallExpression:
    case SyntaxKind.NewExpression:
      return "call_argument";
    case SyntaxKind.PropertyAssignment:
      return "object_value";
    case SyntaxKind.PropertyAccessExpression:
    case SyntaxKind.ElementAccessExpression:
      return "property_value";
    case SyntaxKind.VariableDeclaration:
      return "variable_init";
    case SyntaxKind.JsxAttribute:
    case SyntaxKind.JsxExpression:
      return "jsx_attribute";
    default:
      return "other";
  }
}
