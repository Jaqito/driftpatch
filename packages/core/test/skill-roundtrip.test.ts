import { describe, expect, it } from "vitest";
import { parseSkillMarkdown } from "../src/summary/load.js";
import { serializeSkillToMarkdown } from "../src/summary/serialize.js";
import type { RepoSkill } from "../src/types.js";

const FIXTURE: RepoSkill = {
  version: 1,
  repo: "polaris-components",
  language: "typescript",
  packageManager: "pnpm",
  validation: { commands: ["pnpm typecheck", "pnpm lint", "pnpm test"] },
  areas: [
    {
      name: "components",
      paths: ["components/polaris"],
      pattern: "React wrappers around Shopify Polaris web components.",
    },
    {
      name: "app",
      paths: ["app"],
      pattern: "Next.js app-router pages and layouts.",
    },
  ],
  providerMappings: {
    polaris: [
      { upstreamEntity: "s-button", localFile: "components/polaris/primitives/button.tsx" },
      {
        upstreamEntity: "s-card",
        localFile: "components/polaris/primitives/card.tsx",
        typeName: "CardProps",
      },
    ],
  },
  patchPolicy: {
    rename: "require_review",
    removal: "require_review",
    signature_change: "require_review",
    behavior_change: "require_review",
    new_default: "require_review",
    deprecation: "require_review",
    addition: "require_review",
  },
  examples: [],
};

describe("skill markdown round-trip", () => {
  it("serialize → parse returns equivalent skill", () => {
    const md = serializeSkillToMarkdown(FIXTURE);
    const { skill, warnings } = parseSkillMarkdown(md);
    expect(warnings).toEqual([]);
    expect(skill).toEqual(FIXTURE);
  });

  it("parses provider mapping with typeName", () => {
    const md = serializeSkillToMarkdown(FIXTURE);
    const { skill } = parseSkillMarkdown(md);
    const cardEntry = skill.providerMappings["polaris"]?.find(
      (e) => e.upstreamEntity === "s-card",
    );
    expect(cardEntry?.typeName).toBe("CardProps");
  });

  it("warns rather than throws on missing frontmatter", () => {
    const broken = "no frontmatter here\n\n## Validation\n- pnpm typecheck\n";
    const { skill, warnings } = parseSkillMarkdown(broken);
    expect(warnings.some((w) => w.includes("missing YAML frontmatter"))).toBe(true);
    expect(skill.repo).toBe("unknown");
    expect(skill.validation.commands).toEqual(["pnpm typecheck"]);
  });

  it("rejects unknown patch-policy values", () => {
    const md = serializeSkillToMarkdown(FIXTURE).replace(
      "addition: require_review",
      "addition: yolo",
    );
    const { warnings } = parseSkillMarkdown(md);
    expect(warnings.some((w) => w.includes("unknown policy"))).toBe(true);
  });

  it("survives examples in round-trip", () => {
    const withExamples: RepoSkill = {
      ...FIXTURE,
      examples: [
        {
          title: "s-button: added loading prop",
          body: "Add `loading?: boolean` to ButtonProps; pass through to <s-button>.",
        },
      ],
    };
    const md = serializeSkillToMarkdown(withExamples);
    const { skill } = parseSkillMarkdown(md);
    expect(skill.examples).toEqual(withExamples.examples);
  });
});
