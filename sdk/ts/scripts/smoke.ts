/**
 * Manual smoke test of the SDK against a real Gridone server.
 *
 * Usage:
 *   cp .env.example .env   # fill in credentials
 *   npm run smoke
 *
 * Environment (same names as the seed scripts):
 *   GRIDONE_API       server root URL (default http://localhost:8000)
 *   GRIDONE_USERNAME  login
 *   GRIDONE_PASSWORD  password
 */
import {
  GridoneClient,
  GridoneError,
  isGridoneError,
  isNotFound,
} from "../src/index";

const baseUrl = process.env.GRIDONE_API ?? "http://localhost:8000";
const username = process.env.GRIDONE_USERNAME;
const password = process.env.GRIDONE_PASSWORD;

function ok(message: string): void {
  console.log(`  ✓ ${message}`);
}

function fail(message: string): never {
  console.error(`  ✗ ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (!username || !password) {
    fail(
      "GRIDONE_USERNAME and GRIDONE_PASSWORD are required (see .env.example)",
    );
  }

  console.log(`Smoke-testing ${baseUrl} as ${username}\n`);
  const client = new GridoneClient({ baseUrl });

  // Wrong credentials → GridoneError 401
  try {
    await client.login(username, `not-${password}`);
    fail("login with wrong password should have thrown");
  } catch (error) {
    if (!(isGridoneError(error) && error.status === 401)) throw error;
    ok(`bad credentials rejected (401: ${error.detail})`);
  }

  // Real login
  await client.login(username, password);
  ok("login stored a token pair");

  const me = await client.request<{ username: string; role: string }>(
    "GET",
    "/auth/me",
  );
  ok(`authenticated as ${me.username} (${me.role})`);

  // Wire-format payloads, straight from the API
  const devices = await client.request<
    { id: string; name?: string; kind?: string }[]
  >("GET", "/devices/");
  ok(`listed ${devices.length} device(s)`);
  for (const device of devices.slice(0, 5)) {
    console.log(
      `      - ${device.id} ${device.name ?? ""} [${device.kind ?? "?"}]`,
    );
  }

  // Error mapping on a real 404
  try {
    await client.request("GET", "/devices/definitely-not-a-device");
    fail("expected a 404");
  } catch (error) {
    if (!isNotFound(error)) throw error;
    ok(
      `404 mapped to GridoneError (detail: ${(error as GridoneError).detail})`,
    );
  }

  // Logout clears the session client-side
  await client.logout();
  try {
    await client.request("GET", "/auth/me");
    fail("expected 401 after logout");
  } catch (error) {
    if (!(isGridoneError(error) && error.status === 401)) throw error;
    ok("requests rejected after logout (401)");
  }

  console.log("\nAll smoke checks passed.");
}

main().catch((error: unknown) => {
  console.error("\nSmoke test failed:", error);
  process.exit(1);
});
