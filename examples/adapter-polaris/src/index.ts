import { defineAdapter } from "@driftpatch/adapter-sdk";
import type { ChangeEvent } from "@driftpatch/core";
import { diffSurfaces } from "./differ.js";
import { extractApiSurface } from "./extractor.js";
import { fetchBundle } from "./fetcher.js";
import { summarizePolaris } from "./summarize.js";
import type { ApiSurface, BundleRef } from "./types.js";

interface PolarisRawChangelog {
  text: string;
  metadata: {
    fromBundle: BundleRef;
    toBundle: BundleRef;
  };
}

export const polarisAdapter = defineAdapter({
  name: "polaris",
  versionRange: "*",
  conventions: {
    entityPrefix: "s-",
    namingStyle: "kebab",
    notes:
      "Shopify Polaris web components are kebab-case with `s-` prefix; React wrappers are PascalCase. " +
      "There is no semver — versions are CDN bundle SHAs from /*!<sha>*/ at the top of polaris.js.",
  },

  async fetchChangelog(from, to) {
    const fromBundle = await fetchBundle(from);
    const toBundle = await fetchBundle(to);
    return {
      text: "",
      metadata: { fromBundle, toBundle },
    };
  },

  summarize: summarizePolaris,

  parseChangelog(raw): ChangeEvent[] {
    const polaris = raw as unknown as PolarisRawChangelog;
    const fromSurface = extractApiSurface(
      polaris.metadata.fromBundle.text,
      polaris.metadata.fromBundle.sha,
      polaris.metadata.fromBundle.source,
    );
    const toSurface = extractApiSurface(
      polaris.metadata.toBundle.text,
      polaris.metadata.toBundle.sha,
      polaris.metadata.toBundle.source,
    );
    return diffSurfaces(fromSurface, toSurface, {
      fromVersion: fromSurface.buildSha,
      toVersion: toSurface.buildSha,
    });
  },
});

export { fetchBundle } from "./fetcher.js";
export { extractApiSurface } from "./extractor.js";
export { diffSurfaces } from "./differ.js";
export { summarizePolaris } from "./summarize.js";
export type { ApiSurface, ElementSurface, BundleRef } from "./types.js";
