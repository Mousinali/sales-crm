import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

/**
 * Resolves the currently signed-in user, redirecting to `/login` if there is
 * none. Unlike `getCurrentUser`, this is the actual security boundary:
 * Next.js layouts don't re-render on navigation and don't block their child
 * segments from being included in the RSC payload, so a layout-only auth
 * check is not sufficient on its own. Every protected Server Component /
 * Route Handler must call this (or a future role-checking variant) itself,
 * per the project's Global Constraint that every protected page re-validates
 * the session server-side.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/**
 * Like `requireUser`, but also requires the signed-in user's role to be one
 * of `roles` — redirecting to `/dashboard` (not `/login`, since the user IS
 * authenticated, just not authorized for this page) otherwise.
 */
export async function requireRole(roles: Role[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/dashboard");
  }
  return user;
}
