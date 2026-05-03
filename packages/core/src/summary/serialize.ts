import type { RepoSkill } from "../types.js";

export function serializeSkillToMarkdown(skill: RepoSkill): string {
  const out: string[] = [];

  out.push("---");
  out.push(`version: ${skill.version}`);
  out.push(`repo: ${escapeYaml(skill.repo)}`);
  out.push(`language: ${escapeYaml(skill.language)}`);
  if (skill.packageManager) {
    out.push(`package_manager: ${escapeYaml(skill.packageManager)}`);
  }
  out.push("---");
  out.push("");

  out.push("## Validation");
  if (skill.validation.commands.length === 0) {
    out.push("(no validation commands configured)");
  } else {
    for (const cmd of skill.validation.commands) {
      out.push(`- ${cmd}`);
    }
  }
  out.push("");

  out.push("## Areas");
  if (skill.areas.length === 0) {
    out.push("(no areas defined)");
  } else {
    for (const area of skill.areas) {
      out.push(`### ${area.name}`);
      out.push(`- paths: ${area.paths.join(", ")}`);
      out.push(`- pattern: ${area.pattern}`);
      out.push("");
    }
    out.pop();
  }
  out.push("");

  out.push("## Provider mappings");
  const providerNames = Object.keys(skill.providerMappings).sort();
  if (providerNames.length === 0) {
    out.push("(no provider mappings)");
  } else {
    for (const name of providerNames) {
      out.push(`### ${name}`);
      const entries = skill.providerMappings[name] ?? [];
      for (const entry of entries) {
        const typeClause = entry.typeName ? ` (${entry.typeName})` : "";
        out.push(`- ${entry.upstreamEntity} → ${entry.localFile}${typeClause}`);
      }
      out.push("");
    }
    out.pop();
  }
  out.push("");

  out.push("## Patch policy");
  for (const [kind, policy] of Object.entries(skill.patchPolicy).sort()) {
    out.push(`- ${kind}: ${policy}`);
  }
  out.push("");

  if (skill.examples.length > 0) {
    out.push("## Examples");
    for (const example of skill.examples) {
      out.push(`### ${example.title}`);
      out.push(example.body);
      out.push("");
    }
  }

  return `${out.join("\n").trimEnd()}\n`;
}

function escapeYaml(value: string): string {
  if (/^[A-Za-z0-9._/-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
