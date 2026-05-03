import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  ChangeKindSchema,
  PatchPolicyValueSchema,
  RepoSkillSchema,
  type ChangeKind,
  type PatchPolicyValue,
  type RepoSkill,
} from "../types.js";

export interface LoadSkillResult {
  skill: RepoSkill;
  warnings: string[];
}

export async function loadSkill(filePath: string): Promise<LoadSkillResult> {
  const text = await readFile(filePath, "utf8");
  return parseSkillMarkdown(text);
}

export function parseSkillMarkdown(markdown: string): LoadSkillResult {
  const warnings: string[] = [];
  const { frontmatter, body } = splitFrontmatter(markdown, warnings);

  const sections = splitSections(body);

  const validationCommands = parseBulletList(sections["Validation"] ?? "");
  const areas = parseAreas(sections["Areas"] ?? "", warnings);
  const providerMappings = parseProviderMappings(
    sections["Provider mappings"] ?? "",
    warnings,
  );
  const patchPolicy = parsePatchPolicy(sections["Patch policy"] ?? "", warnings);
  const examples = parseExamples(sections["Examples"] ?? "");

  const candidate: Record<string, unknown> = {
    version: parseInt(frontmatter["version"] ?? "1", 10),
    repo: frontmatter["repo"] ?? "unknown",
    language: frontmatter["language"] ?? "typescript",
    validation: { commands: validationCommands },
    areas,
    providerMappings,
    patchPolicy,
    examples,
  };
  if (frontmatter["package_manager"]) {
    candidate["packageManager"] = frontmatter["package_manager"];
  }

  const parsed = RepoSkillSchema.safeParse(candidate);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Failed to parse driftpatch.skill.md: ${issues}`);
  }

  return { skill: parsed.data, warnings };
}

function splitFrontmatter(
  markdown: string,
  warnings: string[],
): { frontmatter: Record<string, string>; body: string } {
  const lines = markdown.split("\n");
  if (lines[0]?.trim() !== "---") {
    warnings.push("missing YAML frontmatter; using defaults");
    return { frontmatter: {}, body: markdown };
  }
  const closeIdx = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (closeIdx === -1) {
    warnings.push("unterminated YAML frontmatter; ignoring");
    return { frontmatter: {}, body: markdown };
  }

  const frontmatter: Record<string, string> = {};
  for (const line of lines.slice(1, closeIdx)) {
    const match = /^([a-z_][a-z0-9_]*)\s*:\s*(.+?)\s*$/i.exec(line);
    if (!match) continue;
    const value = match[2]!;
    frontmatter[match[1]!] =
      value.startsWith('"') && value.endsWith('"') ? JSON.parse(value) : value;
  }
  return { frontmatter, body: lines.slice(closeIdx + 1).join("\n") };
}

function splitSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const lines = body.split("\n");
  let currentTitle: string | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (currentTitle !== null) sections[currentTitle] = buf.join("\n");
    buf = [];
  };

  for (const line of lines) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading && !line.startsWith("###")) {
      flush();
      currentTitle = heading[1]!;
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

function parseBulletList(section: string): string[] {
  const out: string[] = [];
  for (const line of section.split("\n")) {
    const match = /^-\s+(.+?)\s*$/.exec(line);
    if (match) out.push(match[1]!);
  }
  return out;
}

interface ParsedSubsection {
  title: string;
  bullets: string[];
}

function splitSubsections(section: string): ParsedSubsection[] {
  const out: ParsedSubsection[] = [];
  const lines = section.split("\n");
  let current: ParsedSubsection | null = null;
  for (const line of lines) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) out.push(current);
      current = { title: heading[1]!, bullets: [] };
      continue;
    }
    if (!current) continue;
    const bullet = /^-\s+(.+?)\s*$/.exec(line);
    if (bullet) current.bullets.push(bullet[1]!);
  }
  if (current) out.push(current);
  return out;
}

function parseAreas(section: string, warnings: string[]): RepoSkill["areas"] {
  const out: RepoSkill["areas"] = [];
  for (const sub of splitSubsections(section)) {
    let paths: string[] = [];
    let pattern = "";
    for (const bullet of sub.bullets) {
      const m = /^([a-z_]+)\s*:\s*(.+)$/i.exec(bullet);
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      const value = m[2]!;
      if (key === "paths") paths = value.split(",").map((p) => p.trim()).filter(Boolean);
      else if (key === "pattern") pattern = value;
    }
    if (paths.length === 0) {
      warnings.push(`area ${sub.title}: no paths defined; skipping`);
      continue;
    }
    out.push({ name: sub.title, paths, pattern });
  }
  return out;
}

function parseProviderMappings(
  section: string,
  warnings: string[],
): RepoSkill["providerMappings"] {
  const out: RepoSkill["providerMappings"] = {};
  for (const sub of splitSubsections(section)) {
    const entries: Array<{ upstreamEntity: string; localFile: string; typeName?: string }> = [];
    for (const bullet of sub.bullets) {
      const m = /^(\S+)\s*→\s*(\S+?)(?:\s+\(([^)]+)\))?\s*$/.exec(bullet);
      if (!m) {
        warnings.push(`provider ${sub.title}: could not parse '${bullet}'`);
        continue;
      }
      const entry: { upstreamEntity: string; localFile: string; typeName?: string } = {
        upstreamEntity: m[1]!,
        localFile: m[2]!,
      };
      if (m[3]) entry.typeName = m[3];
      entries.push(entry);
    }
    if (entries.length > 0) out[sub.title] = entries;
  }
  return out;
}

function parsePatchPolicy(
  section: string,
  warnings: string[],
): RepoSkill["patchPolicy"] {
  const out = {} as Record<ChangeKind, PatchPolicyValue>;
  for (const bullet of parseBulletList(section)) {
    const m = /^([a-z_]+)\s*:\s*([a-z_]+)\s*$/i.exec(bullet);
    if (!m) continue;
    const kindResult = ChangeKindSchema.safeParse(m[1]);
    const policyResult = PatchPolicyValueSchema.safeParse(m[2]);
    if (!kindResult.success) {
      warnings.push(`patch policy: unknown change kind '${m[1]}'`);
      continue;
    }
    if (!policyResult.success) {
      warnings.push(`patch policy: unknown policy '${m[2]}' for ${m[1]}`);
      continue;
    }
    out[kindResult.data] = policyResult.data;
  }
  return out;
}

function parseExamples(section: string): RepoSkill["examples"] {
  const out: RepoSkill["examples"] = [];
  const lines = section.split("\n");
  let current: { title: string; body: string[] } | null = null;
  for (const line of lines) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading) {
      if (current) out.push({ title: current.title, body: current.body.join("\n").trim() });
      current = { title: heading[1]!, body: [] };
      continue;
    }
    if (current) current.body.push(line);
  }
  if (current) out.push({ title: current.title, body: current.body.join("\n").trim() });
  return out;
}

void z;
