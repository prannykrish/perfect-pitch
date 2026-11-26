import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * `npm run dev:lan`: the phone opens the laptop's Wi‑Fi address (the "Network" URL Next prints).
 * The dev server only hands its own resources (hot reload, dev chunks) to localhost unless other
 * hosts are named here, so name this machine's network addresses. Development only; a production
 * build ignores it.
 */
const lanAddresses = Object.values(os.networkInterfaces())
  .flat()
  .filter((a): a is os.NetworkInterfaceInfo => !!a && a.family === "IPv4" && !a.internal)
  .map((a) => a.address);

/**
 * The sample folders (`npm run samples`, `npm run samples:streamed`) are 800 MB and stay out of
 * git, so the hosted build has none. Tell the audio engine at build time whether they are here, so
 * the hosted app goes straight to the public CDN instead of asking this site for files it lacks.
 * SAMPLES_FROM_CDN=1 builds the laptop's copy the hosted way, to try that path here.
 */
const hasPublic = (file: string) => (!process.env.SAMPLES_FROM_CDN && fs.existsSync(path.join(process.cwd(), "public", file)) ? "1" : "");

const nextConfig: NextConfig = {
  allowedDevOrigins: lanAddresses,
  // Next's round "N" badge sits bottom left in development, which on a phone is on top of the first
  // tab of the tab bar and swallows its taps. Compile and runtime errors are still shown.
  devIndicators: false,
  env: {
    NEXT_PUBLIC_LOCAL_SOUNDFONTS: hasPublic("soundfonts/manifest.json"),
    NEXT_PUBLIC_LOCAL_STREAMED: hasPublic("streamed/manifest.json"),
  },
  // The database client reads the migrations in drizzle/ from disk on a cold start; the hosted
  // functions only get the files Next can see being imported, so name the folder.
  outputFileTracingIncludes: { "/*": ["./drizzle/**/*"] },
};

export default nextConfig;
