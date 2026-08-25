import fs from "node:fs";
import path from "node:path";

/** Credentials from env (manual) or the transient fixture file. */
export function e2eCreds(): { username?: string; password?: string } {
  if (process.env.E2E_USERNAME && process.env.E2E_PASSWORD) {
    return { username: process.env.E2E_USERNAME, password: process.env.E2E_PASSWORD };
  }
  const f = path.join(__dirname, "..", "..", ".e2e-auth.json");
  if (fs.existsSync(f)) {
    try {
      return JSON.parse(fs.readFileSync(f, "utf8"));
    } catch {
      /* fallthrough */
    }
  }
  return {};
}

export const hasCreds = (): boolean => {
  const c = e2eCreds();
  return Boolean(c.username && c.password);
};
