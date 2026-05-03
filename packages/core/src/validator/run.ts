import { spawn } from "node:child_process";

export interface ValidationStepResult {
  command: string;
  passed: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export interface RunValidationOptions {
  cwd: string;
  timeoutMs?: number;
  stopOnFirstFailure?: boolean;
  maxOutputBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;

export async function runValidation(
  commands: string[],
  opts: RunValidationOptions,
): Promise<ValidationStepResult[]> {
  const out: ValidationStepResult[] = [];
  for (const command of commands) {
    const result = await runOne(command, opts);
    out.push(result);
    if (!result.passed && opts.stopOnFirstFailure !== false) {
      break;
    }
  }
  return out;
}

function runOne(command: string, opts: RunValidationOptions): Promise<ValidationStepResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = opts.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const start = Date.now();

  return new Promise<ValidationStepResult>((resolve) => {
    const child = spawn(command, {
      cwd: opts.cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0", CI: "1" },
    });

    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes <= maxOutputBytes) stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= maxOutputBytes) stderr += chunk.toString("utf8");
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const durationMs = Date.now() - start;
      const exitCode = code ?? (signal ? -1 : null);
      resolve({
        command,
        passed: exitCode === 0 && !timedOut,
        exitCode,
        stdout: stdoutBytes > maxOutputBytes ? `${stdout}\n[output truncated at ${maxOutputBytes} bytes]` : stdout,
        stderr: stderrBytes > maxOutputBytes ? `${stderr}\n[output truncated at ${maxOutputBytes} bytes]` : stderr,
        durationMs,
        timedOut,
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        command,
        passed: false,
        exitCode: null,
        stdout,
        stderr: stderr + `\nspawn error: ${err.message}`,
        durationMs: Date.now() - start,
        timedOut,
      });
    });
  });
}

export function summarizeValidationFailures(
  steps: ValidationStepResult[],
  maxLines = 80,
): string {
  const failed = steps.filter((s) => !s.passed);
  if (failed.length === 0) return "(all validation steps passed)";
  const out: string[] = [];
  for (const step of failed) {
    out.push(`### Failed: \`${step.command}\` (exit ${step.exitCode}${step.timedOut ? ", timed out" : ""})`);
    out.push("");
    const combined = step.stderr.length > 0 ? step.stderr : step.stdout;
    const lines = combined.trim().split("\n");
    const trimmed = lines.length > maxLines ? [...lines.slice(0, maxLines), `[+${lines.length - maxLines} more lines]`] : lines;
    out.push("```");
    out.push(...trimmed);
    out.push("```");
    out.push("");
  }
  return out.join("\n");
}
