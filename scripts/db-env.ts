/**
 * For the database scripts: read .env.local the way `next dev` does (DATABASE_URL,
 * DATABASE_AUTH_TOKEN), and turn the words "local" and "cloud" into database addresses.
 * Nothing here prints a secret.
 */
import { existsSync } from "node:fs";
import { DEFAULT_DATABASE_URL, databaseEnv, isRemoteUrl } from "../src/lib/db/connect";

export function loadEnv(): void {
  // Variables already set in the shell win, as with Next.
  for (const file of [".env.local", ".env"]) if (existsSync(file)) process.loadEnvFile(file);
}

export interface Target {
  url: string;
  authToken?: string;
}

/**
 * "local" = the file on this laptop, "cloud" = the Turso database named in .env.local, "current" =
 * whatever DATABASE_URL says (what the app itself uses). Anything else is taken as a URL: a
 * `file:` path, or a libsql:// address (which uses DATABASE_AUTH_TOKEN).
 */
export function resolveTarget(name: string): Target {
  const env = databaseEnv();
  if (name === "local") return { url: DEFAULT_DATABASE_URL };
  if (name === "current") return env;
  if (name === "cloud") {
    if (!isRemoteUrl(env.url)) throw new Error('"cloud" needs DATABASE_URL in .env.local to be the Turso address (libsql://…), and DATABASE_AUTH_TOKEN next to it.');
    return env;
  }
  if (isRemoteUrl(name)) return { url: name, authToken: env.authToken };
  return { url: name.startsWith("file:") ? name : `file:${name}` };
}
