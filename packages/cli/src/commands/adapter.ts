export async function runAdapterInit(opts: { provider: string }): Promise<void> {
  console.log(`[adapter init] would scaffold adapter-${opts.provider}/`);
  console.log("[adapter init] not implemented yet");
}

export async function runAdapterGenerate(opts: {
  provider: string;
  samples: string;
}): Promise<void> {
  console.log(`[adapter generate] would draft parser for ${opts.provider} from ${opts.samples}`);
  console.log("[adapter generate] not implemented yet");
}

export async function runAdapterTest(opts: { provider: string }): Promise<void> {
  console.log(`[adapter test] would run fixtures.test.ts for ${opts.provider}`);
  console.log("[adapter test] not implemented yet");
}
