import type { JsxAttribute, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ImportEdge, JsxUsage } from "../types.js";

export function extractJsxUsages(
  source: SourceFile,
  imports: ImportEdge[],
  filePath: string,
): JsxUsage[] {
  const usages: JsxUsage[] = [];
  const importIndex = buildImportIndex(imports);

  source.forEachDescendant((node) => {
    const opening = pickOpening(node);
    if (!opening) return;

    const tagName = opening.getTagNameNode().getText();
    if (!isLikelyComponent(tagName)) return;

    const props: JsxUsage["props"] = [];
    for (const attr of opening.getAttributes()) {
      const named = attr.asKind(SyntaxKind.JsxAttribute);
      if (!named) continue;
      const name = named.getNameNode().getText();
      const valueLiteral = readLiteralValue(named);
      props.push({ name, valueLiteral: valueLiteral ?? undefined });
    }

    usages.push({
      filePath,
      line: opening.getStartLineNumber(),
      componentName: tagName,
      importSource: importIndex.get(tagName.split(".")[0] ?? tagName),
      props,
    });
  });

  return usages;
}

function pickOpening(node: Node) {
  const opening = node.asKind(SyntaxKind.JsxOpeningElement);
  if (opening) return opening;
  const selfClosing = node.asKind(SyntaxKind.JsxSelfClosingElement);
  return selfClosing ?? null;
}

function isLikelyComponent(tagName: string): boolean {
  const first = tagName[0];
  if (!first) return false;
  if (first === first.toUpperCase() && first !== first.toLowerCase()) return true;
  if (tagName.startsWith("s-") || tagName.includes("-")) return true;
  return false;
}

function readLiteralValue(attr: JsxAttribute): string | null {
  const init = attr.getInitializer();
  if (!init) return "true";
  const stringLit = init.asKind(SyntaxKind.StringLiteral);
  if (stringLit) return stringLit.getLiteralText();
  const expr = init.asKind(SyntaxKind.JsxExpression);
  if (!expr) return null;
  const inner = expr.getExpression();
  if (!inner) return null;
  const innerString = inner.asKind(SyntaxKind.StringLiteral);
  if (innerString) return innerString.getLiteralText();
  if (inner.getKind() === SyntaxKind.TrueKeyword) return "true";
  if (inner.getKind() === SyntaxKind.FalseKeyword) return "false";
  const numLit = inner.asKind(SyntaxKind.NumericLiteral);
  if (numLit) return numLit.getText();
  return null;
}

function buildImportIndex(imports: ImportEdge[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const edge of imports) {
    for (const raw of edge.importedNames) {
      const localName = extractLocalName(raw);
      if (localName) index.set(localName, edge.source);
    }
  }
  return index;
}

function extractLocalName(spec: string): string | null {
  const asMatch = / as ([A-Za-z_$][\w$]*)$/.exec(spec);
  if (asMatch) return asMatch[1] ?? null;
  if (spec === "*" || spec === "default") return null;
  return spec;
}
