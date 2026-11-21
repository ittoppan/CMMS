import fs from "node:fs";
import path from "node:path";

/**
 * Credentials from env (manual) or the transient fixture file.
 *
 * The fixture file is created once by global setup and deleted in teardown.
 * We cache the first successful read in-process so that specs keep working
 * even if the file disappears mid-run (e.g. teardown racing, or run-order
 * differences) — the credentials are immutable for the lifetime of a run.
 */
let cached: { username?: string; password?: string } | null = null;

export function e2eCreds(): { username?: string; password?: string } {
  if (process.env.E2E_USERNAME && process.env.E2E_PASSWORD) {
    const c = { username: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD };
    cached = c;
    return c;
  }
  if (cached && cached.username && cached.password) return cached;
  const f = path.join(__dirname, "..", "..", ".e2e-auth.json");
  if (fs.existsSync(f)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
      if (parsed?.username && parsed?.password) {
        cached = parsed;
        return parsed;
      }
    } catch {
      /* fallthrough */
    }
  }
  return cached ?? {};
}

export const hasCreds = (): boolean => {
  const c = e2eCreds();
  return Boolean(c.username && c.password);
};
