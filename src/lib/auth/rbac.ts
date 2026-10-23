import { cookies } from "next/headers";
import { getSessionUser, SESSION_COOKIE_NAME } from "./session";
import type { Role } from "./roles";

export type AuthUser = { id: number; role: Role; name: string; email: string };

/**
 * Resolves the currently signed-in user from the session cookie, or `null`
 * if there is no cookie or the session/user it names is no longer valid.
 * Callers (protected Server Components and Route Handlers) redirect to
 * `/login` on `null`.
 */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const user = await getSessionUser(token);
  if (!user) return null;

  return { id: user.id, role: user.role, name: user.name, email: user.email };
}
