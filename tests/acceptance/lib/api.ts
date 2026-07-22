import { GridoneClient } from "@gridone/sdk";

export const baseUrl = process.env.GRIDONE_API ?? "http://localhost:8765/api";
export const username = process.env.GRIDONE_USERNAME ?? "admin";
export const password = process.env.GRIDONE_PASSWORD ?? "admin";

export function makeClient(): GridoneClient {
  return new GridoneClient({ baseUrl });
}

export async function makeAdminClient(): Promise<GridoneClient> {
  const client = makeClient();
  await client.login(username, password);
  return client;
}

let roleClientCounter = 0;

/**
 * Create a fresh user with the given role (as admin) and return a client
 * logged in as that user — used for RBAC checks. Usernames are unique so
 * re-runs against a non-fresh stack don't collide.
 */
export async function makeRoleClient(
  role: "operator" | "viewer",
): Promise<GridoneClient> {
  const admin = await makeAdminClient();
  const uname = `acceptance-${role}-${Date.now()}-${roleClientCounter++}`;
  const pwd = "acceptance-pass";
  await admin.users.create({ username: uname, password: pwd, role });
  const client = makeClient();
  await client.login(uname, pwd);
  return client;
}

export interface PollOptions {
  timeoutMs?: number;
  intervalMs?: number;
  /** Included in the timeout error to identify what never became true. */
  description: string;
}

/**
 * Repeatedly reads until the predicate passes — for values produced by
 * background work (driver polling, timeseries recording), never for command
 * confirmation: commands execute synchronously and confirm in their response.
 */
export async function pollUntil<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  { timeoutMs = 30_000, intervalMs = 1_000, description }: PollOptions,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await read();
    if (predicate(last)) {
      return last;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for ${description}. Last value: ${JSON.stringify(last)}`,
  );
}
