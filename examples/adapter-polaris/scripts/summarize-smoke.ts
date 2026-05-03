/**
 * Dev smoke: run summarizePolaris against a real repo and print results.
 * Usage: npx tsx scripts/summarize-smoke.ts <repo-path>
 */
import { indexRepo } from "@driftpatch/core";
import { summarizePolaris } from "../src/summarize.js";

async function main() {
  const repo = process.argv[2];
  if (!repo) {
    console.error("usage: summarize-smoke.ts <repo-path>");
    process.exit(2);
  }

  console.log(`Indexing ${repo} ...`);
  const t0 = Date.now();
  const index = await indexRepo(repo, { useCache: true });
  console.log(`Indexed ${index.files.length} files in ${Date.now() - t0}ms\n`);

  const snap = summarizePolaris(index);

  console.log(`Provider: ${snap.name}`);
  console.log(`Packages: ${snap.packages.join(", ")}`);
  console.log(`Files importing directly: ${snap.filesUsing.length}`);

  if (snap.affinity.jsx) {
    console.log(`\nJSX affinity:`);
    console.log(`  Components seen (${snap.affinity.jsx.components.length}): ${snap.affinity.jsx.components.slice(0, 20).join(", ")}${snap.affinity.jsx.components.length > 20 ? " ..." : ""}`);
    console.log(`  Sample files: ${snap.affinity.jsx.sampleFiles.slice(0, 5).join(", ")}`);
  }

  if (snap.wrapperCandidates && snap.wrapperCandidates.length > 0) {
    console.log(`\nWrapper candidates (${snap.wrapperCandidates.length} elements):`);
    for (const w of snap.wrapperCandidates.slice(0, 15)) {
      console.log(`  ${w.upstreamEntity}:`);
      for (const c of w.candidates.slice(0, 3)) {
        console.log(`    [${c.score}] ${c.file} (exports: ${c.exports.join(", ")})`);
      }
    }
    if (snap.wrapperCandidates.length > 15) {
      console.log(`  ... and ${snap.wrapperCandidates.length - 15} more elements`);
    }
  } else {
    console.log("\n(no wrapper candidates detected)");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
