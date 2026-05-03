import { defineAdapter } from "@driftpatch/adapter-sdk";

export const polarisAdapter = defineAdapter({
  name: "polaris",
  versionRange: ">=12.0.0 <14.0.0",
  conventions: {
    entityPrefix: "s-",
    namingStyle: "kebab",
    notes: "Shopify Polaris web components are kebab-case with `s-` prefix; React wrappers are PascalCase.",
  },
  parseChangelog({ text: _text }) {
    return [];
  },
  getEntityDefinition(_name, _version) {
    return null;
  },
});
