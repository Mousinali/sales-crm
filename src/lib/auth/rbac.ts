import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser, sessionTokenFromCookieHeader, SESSION_COOKIE_NAME } from "./session";
import type { Role } from "./roles";

export type AuthUser = { id: number; role: Role; name: string; email: string; mustChangePassword: boolean };

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

  return { id: user.id, role: user.role, name: user.name, email: user.email, mustChangePassword: user.must_change_password };
}

/**
 * Resolves the currently signed-in user, redirecting to `/login` if there is
 * none, and to `/change-password` if the account must set a new password
 * before doing anything else (unless the caller explicitly opts out, which
 * only the `/change-password` page itself should do). Unlike `getCurrentUser`,
 * this is the actual security boundary: Next.js layouts don't re-render on
 * navigation and don't block their child segments from being included in the
 * RSC payload, so a layout-only auth check is not sufficient on its own.
 * Every protected Server Component / Route Handler must call this (or a
 * future role-checking variant) itself, per the project's Global Constraint
 * that every protected page re-validates the session server-side.
 */
export async function requireUser(options?: { skipMustChangePasswordCheck?: boolean }): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.mustChangePassword && !options?.skipMustChangePasswordCheck) {
    redirect("/change-password");
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

/** Extracts the raw session token from a Request's Cookie header, or undefined if absent. */
export function sessionTokenFromRequest(request: Request): string | undefined {
  return sessionTokenFromCookieHeader(request.headers.get("cookie") ?? "");
}

/**
 * Like `getCurrentUser`, but for Route Handlers: resolves the session from
 * the `Request`'s own `Cookie` header instead of `next/headers`'s
 * `cookies()`. Route Handlers must use this, not `getCurrentUser`, because
 * `cookies()` requires Next's own request-dispatch context, which exists
 * when the Next.js server actually invokes the handler but not when this
 * project's Route Handler tests call the exported function directly.
 * Pages/Server Components (which this project never unit-tests via direct
 * invocation) should keep using `getCurrentUser`/`requireUser`/`requireRole`.
 */
export async function getCurrentUserFromRequest(request: Request): Promise<AuthUser | null> {
  const token = sessionTokenFromRequest(request);
  if (!token) return null;

  const user = await getSessionUser(token);
  if (!user) return null;

  return { id: user.id, role: user.role, name: user.name, email: user.email, mustChangePassword: user.must_change_password };
}
