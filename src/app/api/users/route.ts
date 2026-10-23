import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "../../../lib/db";
import { getSessionUser, SESSION_COOKIE_NAME } from "../../../lib/auth/session";
import { ROLES } from "../../../lib/auth/roles";
import { createUser } from "../../../lib/users/create";
import { RoleNotManageableError, EmailAlreadyExistsError } from "../../../lib/users/errors";

const createUserSchema = z.object({
  role: z.enum(ROLES),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
});

// Deliberately reads the session cookie off `request.headers` and resolves
// it via `getSessionUser`, the same way `login`/`logout`'s route handlers
// do — NOT via `getCurrentUser` (src/lib/auth/rbac.ts), which calls
// `next/headers` `cookies()`. That API requires Next's own request-handling
// async-storage context, which exists when a route handler is actually
// invoked by the Next.js server but not when its exported function is
// called directly (as this project's route handler tests do), so it throws
// "cookies was called outside a request scope" in that context.
function sessionTokenFrom(request: Request): string | undefined {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  return match?.slice(SESSION_COOKIE_NAME.length + 1);
}

export async function POST(request: Request): Promise<Response> {
  const token = sessionTokenFrom(request);
  const user = token ? await getSessionUser(token) : null;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    const created = await createUser(pool, {
      creatorId: user.id,
      creatorRole: user.role,
      role: parsed.data.role,
      name: parsed.data.name,
      email: parsed.data.email,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof RoleNotManageableError) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (error instanceof EmailAlreadyExistsError) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    throw error;
  }
}
