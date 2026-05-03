/**
 * Dev-only smoke test for the Polaris bundle differ.
 *
 * Fetches the current CDN bundle plus one known archived historical
 * bundle (via polaris-changelog.dev — dev convenience only, NOT used
 * at runtime), runs API surface extraction on both, and prints a
 * summary so we can eyeball whether the extractor is sane.
 *
 * The archive URL is a one-time fixture-seeding convenience. Production
 * runs use the customer's local baseline store, never this archive.
 */
import { fetchBundle } from "../src/fetcher.js";
import { extractApiSurface } from "../src/extractor.js";
import type { ApiSurface } from "../src/types.js";

const KNOWN_OLD_SHA = "913ce26d86e1755e5b8c29606465c88c2fccf691";
const CACHE_DIR = "/tmp/polaris-cache";

async function main() {
  console.log("--- Fetching current CDN bundle ---");
  const current = await fetchBundle("current", { cacheDir: CACHE_DIR });
  console.log(`current sha (from comment): ${current.sha}`);
  console.log(`current bundle size: ${current.text.length.toLocaleString()} bytes`);

  console.log("\n--- Fetching archived old bundle (dev backfill) ---");
  const old = await fetchBundle(KNOWN_OLD_SHA, { cacheDir: CACHE_DIR });
  console.log(`old sha: ${old.sha}`);
  console.log(`old bundle size: ${old.text.length.toLocaleString()} bytes`);

  console.log("\n--- Extracting current surface ---");
  const currentSurface = extractApiSurface(current.text, current.sha, current.source);
  printSurface("current", currentSurface);

  console.log("\n--- Extracting old surface ---");
  const oldSurface = extractApiSurface(old.text, old.sha, old.source);
  printSurface("old", oldSurface);

  console.log("\n--- Quick element-name diff preview ---");
  const currentNames = new Set(currentSurface.elements.keys());
  const oldNames = new Set(oldSurface.elements.keys());
  const added = [...currentNames].filter((n) => !oldNames.has(n)).sort();
  const removed = [...oldNames].filter((n) => !currentNames.has(n)).sort();
  console.log(`elements added in current: ${added.join(", ") || "(none)"}`);
  console.log(`elements removed in current: ${removed.join(", ") || "(none)"}`);
}

function printSurface(label: string, s: ApiSurface) {
  console.log(`[${label}] elements: ${s.elements.size}`);
  console.log(`[${label}] warnings: ${s.extractionWarnings.length}`);
  if (s.extractionWarnings.length > 0) {
    for (const w of s.extractionWarnings.slice(0, 5)) console.log(`  warn: ${w}`);
    if (s.extractionWarnings.length > 5) {
      console.log(`  (+${s.extractionWarnings.length - 5} more warnings)`);
    }
  }
  for (const [name, el] of [...s.elements].sort()) {
    const attrs = el.observedAttributes.length > 0 ? `[${el.observedAttributes.join(",")}]` : "[]";
    console.log(`  ${name}: attrs=${attrs} props=${el.properties.length} methods=${el.methods.length}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
