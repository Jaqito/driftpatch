export interface DirSummary {
  path: string;
  tsxFiles: number;
  tsFiles: number;
  otherFiles: number;
}

export interface JsxAffinity {
  components: string[];
  sampleFiles: string[];
}

export interface CallAffinity {
  method: string;
  sampleFiles: string[];
  count: number;
}

export interface LiteralAffinity {
  value: string;
  context: string;
  sampleFiles: string[];
  count: number;
}

export interface PropertyValueAffinity {
  keyPath: string;
  values: string[];
  sampleFiles: string[];
  count: number;
}

export interface ProviderAffinity {
  jsx?: JsxAffinity;
  callSites?: CallAffinity[];
  literals?: LiteralAffinity[];
  propertyValues?: PropertyValueAffinity[];
}

export interface WrapperCandidate {
  upstreamEntity: string;
  candidates: Array<{
    file: string;
    exports: string[];
    score: number;
  }>;
}

export interface ProviderSnapshot {
  name: string;
  packages: string[];
  filesUsing: string[];
  affinity: ProviderAffinity;
  wrapperCandidates?: WrapperCandidate[];
}

export interface AreaSnapshot {
  path: string;
  fileCount: number;
  exampleFiles: string[];
  exampleSnippets?: string[];
}

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun" | "unknown";
export type RepoLanguage = "typescript" | "javascript" | "mixed";

export interface RepoSummary {
  name: string;
  language: RepoLanguage;
  packageManager: PackageManager;
  scripts: Record<string, string>;
  validationCandidates: string[];
  topDirs: DirSummary[];
  providersDetected: ProviderSnapshot[];
  areaCandidates: AreaSnapshot[];
}
