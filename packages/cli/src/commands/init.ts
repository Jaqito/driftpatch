export interface InitOptions {
  repo: string;
}

export async function runInit(opts: InitOptions): Promise<void> {
  console.log(`[init] would scan ${opts.repo} and propose driftpatch.skill.md`);
  console.log("[init] not implemented yet");
}
