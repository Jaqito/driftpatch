/**
 * End-to-end smoke test of the Polaris adapter:
 * fetch two bundles → extract surfaces → diff → print ChangeEvents.
 */
import { polarisAdapter } from "../src/index.js";

const KNOWN_OLD_SHA = "913ce26d86e1755e5b8c29606465c88c2fccf691";

async function main() {
  console.log(`Diffing ${KNOWN_OLD_SHA.slice(0, 8)} → current CDN bundle\n`);
  const raw = await polarisAdapter.fetchChangelog!(KNOWN_OLD_SHA, "current");
  const events = await polarisAdapter.parseChangelog(raw);

  console.log(`Generated ${events.length} ChangeEvent(s)\n`);

  const byKind = new Map<string, number>();
  for (const e of events) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
  console.log("By kind:");
  for (const [kind, count] of byKind) console.log(`  ${kind}: ${count}`);
  console.log();

  const byElement = new Map<string, number>();
  for (const e of events) {
    const el = (e.attributes?.element as string) ?? e.entity;
    byElement.set(el, (byElement.get(el) ?? 0) + 1);
  }
  console.log("By element (top 15 with most changes):");
  const sorted = [...byElement].sort(([, a], [, b]) => b - a).slice(0, 15);
  for (const [el, count] of sorted) console.log(`  ${el}: ${count}`);
  console.log();

  console.log("First 30 events:");
  for (const e of events.slice(0, 30)) {
    console.log(`  [${e.kind} risk:${e.risk}] ${e.entity} — ${e.description}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
