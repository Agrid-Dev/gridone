import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { pollUntil } from "./api";

const execFileAsync = promisify(execFile);

// Emulators are addressed by compose *service* name, never by container name:
// the stack deliberately sets neither `container_name` nor a restart policy so
// parallel stacks can coexist. That means running compose from
// tests/acceptance, the directory where compose.yaml and compose.override.yaml
// are merged.
const composeDir = fileURLToPath(new URL("..", import.meta.url));

async function compose(...args: string[]): Promise<void> {
  try {
    await execFileAsync("docker", ["compose", ...args], { cwd: composeDir });
  } catch (error) {
    const stderr =
      error instanceof Error && "stderr" in error ? String(error.stderr) : "";
    throw new Error(
      `\`docker compose ${args.join(" ")}\` failed in ${composeDir}. ` +
        `Is the acceptance stack up (npm run stack:up)? ${stderr}`.trim(),
      { cause: error },
    );
  }
}

/**
 * Powers an emulator down — the "someone unplugged the device" channel, the
 * availability counterpart to the state side-channel the other suites use.
 *
 * Docker drops the service name from the stack's DNS while the container is
 * down, so gridone's reads fail on name resolution instead of hanging: poll
 * sweeps keep their cadence and the status transition stays on the driver's
 * clock. `--timeout 1` bounds the SIGTERM grace period so a container that
 * ignores it doesn't cost compose's 10s default.
 */
export async function stopEmulator(service: string): Promise<void> {
  await compose("stop", "--timeout", "1", service);
}

/** Powers an emulator back up. Returning does not mean it serves yet — pair
 *  with `waitForEmulator`. */
export async function startEmulator(service: string): Promise<void> {
  await compose("up", "-d", service);
}

async function isServing(url: string): Promise<boolean> {
  try {
    // Liveness, not correctness: any HTTP response means the controller is
    // listening again, so a 404 on the probed path counts as much as a 200.
    // Bounded so a container that accepts connections without answering can't
    // stall the wait past pollUntil's own deadline.
    await fetch(url, { signal: AbortSignal.timeout(1_000) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Waits until a restarted emulator serves its http controller again.
 *
 * The default deadline outlives vitest's 10s hook timeout, so a `beforeAll`
 * calling this must raise its own (`beforeAll(fn, 30_000)`) — otherwise the
 * hook fails first and this wait's error never surfaces.
 */
export async function waitForEmulator(
  url: string,
  timeoutMs = 30_000,
): Promise<void> {
  await pollUntil(
    () => isServing(url),
    (serving) => serving,
    {
      intervalMs: 250,
      timeoutMs,
      description: `emulator at ${url} to serve again after a restart`,
    },
  );
}
