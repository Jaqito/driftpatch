export interface ElementSurface {
  name: string;
  observedAttributes: string[];
  properties: string[];
  methods: string[];
}

export interface ApiSurface {
  buildSha: string;
  source: "cdn" | "archive" | "cache" | "literal";
  elements: Map<string, ElementSurface>;
  fetchedAt: string;
  extractionWarnings: string[];
}

export interface BundleRef {
  sha: string;
  text: string;
  source: ApiSurface["source"];
}
