import { defineAdapter } from "@driftpatch/adapter-sdk";
import type { ChangeEvent } from "@driftpatch/core";

const HEADING_RE = /^##+\s+(.+)$/;
const VERSION_RE = /(\d+\.\d+\.\d+)/;

export const genericAdapter = defineAdapter({
  name: "generic",
  versionRange: "*",
  conventions: {
    notes: "No provider-specific conventions. Falls back to fully agentic classification downstream.",
  },
  parseChangelog({ text }) {
    const events: ChangeEvent[] = [];
    const lines = text.split("\n");

    let currentVersion = "unknown";
    let prevVersion = "unknown";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? "";
      const heading = HEADING_RE.exec(line);
      if (heading) {
        const v = VERSION_RE.exec(heading[1] ?? "");
        if (v?.[1]) {
          prevVersion = currentVersion;
          currentVersion = v[1];
        }
        continue;
      }

      const bullet = /^[-*]\s+(.+)$/.exec(line);
      if (!bullet) continue;
      const description = bullet[1] ?? "";
      if (!description) continue;

      events.push({
        id: `generic:${currentVersion}:${i}`,
        provider: "generic",
        kind: inferKind(description),
        entity: extractEntity(description) ?? "unknown",
        fromVersion: prevVersion,
        toVersion: currentVersion,
        description,
        risk: "medium",
      });
    }

    return events;
  },
});

function inferKind(text: string): ChangeEvent["kind"] {
  const t = text.toLowerCase();
  if (t.includes("rename")) return "rename";
  if (t.includes("remove") || t.includes("delete")) return "removal";
  if (t.includes("deprecat")) return "deprecation";
  if (t.includes("default")) return "new_default";
  if (t.includes("add") || t.includes("new ")) return "addition";
  if (t.includes("signature") || t.includes("param")) return "signature_change";
  return "behavior_change";
}

function extractEntity(text: string): string | null {
  const code = /`([^`]+)`/.exec(text);
  return code?.[1] ?? null;
}
