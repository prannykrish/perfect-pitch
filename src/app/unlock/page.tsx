import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GATE_COOKIE, isUnlocked, safeNextPath } from "@/lib/auth/gate";
import { UnlockForm } from "./unlock-form";

export const metadata: Metadata = { title: "Unlock · Perfect Pitch Lab" };

/** The one page a locked device can see (src/proxy.ts sends everything else here). */
export default async function UnlockPage(props: PageProps<"/unlock">) {
  const sp = await props.searchParams;
  const next = safeNextPath(typeof sp.next === "string" ? sp.next : undefined);
  // Already unlocked, or no gate at all (the laptop without APP_PASSWORD): nothing to do here.
  const jar = await cookies();
  if (await isUnlocked(jar.get(GATE_COOKIE)?.value)) redirect(next);
  return <UnlockForm next={next} />;
}
