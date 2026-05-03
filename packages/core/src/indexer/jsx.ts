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

    const lookupKey = tagName.split(".")[0] ?? tagName;
    const importInfo = importIndex.get(lookupKey);
    usages.push({
      filePath,
      line: opening.getStartLineNumber(),
      componentName: tagName,
      ...(importInfo?.original && importInfo.original !== lookupKey
        ? { originalName: importInfo.original }
        : {}),
      ...(importInfo?.source ? { importSource: importInfo.source } : {}),
      props,
    });
  });

  return usages;
}

interface ImportInfo {
  source: string;
  original: string;
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

function buildImportIndex(imports: ImportEdge[]): Map<string, ImportInfo> {
  const index = new Map<string, ImportInfo>();
  for (const edge of imports) {
    for (const raw of edge.importedNames) {
      const parsed = parseImportSpec(raw);
      if (!parsed) continue;
      index.set(parsed.local, { source: edge.source, original: parsed.original });
    }
  }
  return index;
}

function parseImportSpec(spec: string): { local: string; original: string } | null {
  const asMatch = /^(.+?)\s+as\s+([A-Za-z_$][\w$]*)$/.exec(spec);
  if (asMatch) {
    const original = asMatch[1]!.replace(/^default\s+/, "default");
    const local = asMatch[2]!;
    return { local, original: original === "default" ? "default" : original };
  }
  if (spec === "*" || spec === "default") return null;
  return { local: spec, original: spec };
}
