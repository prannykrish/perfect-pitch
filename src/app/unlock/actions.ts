"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GATE_COOKIE, GATE_MAX_AGE, gatePassword, gateToken, passwordMatches, safeNextPath } from "@/lib/auth/gate";

export interface UnlockState {
  error: string | null;
}

/** Check the password; on a match, remember this device for a year and go to the page that was asked for. */
export async function unlock(_prev: UnlockState, formData: FormData): Promise<UnlockState> {
  const attempt = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const password = gatePassword();
  if (password) {
    if (!(await passwordMatches(attempt))) {
      await new Promise((resolve) => setTimeout(resolve, 600)); // makes guessing slow
      return { error: "That is not the password." };
    }
    const jar = await cookies();
    jar.set(GATE_COOKIE, await gateToken(password), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: GATE_MAX_AGE,
    });
  }
  redirect(next);
}
