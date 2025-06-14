import { getCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
import { prisma } from "../utils/database";

// Middleware to check authentication
export async function requireAuth(c: Context, next: () => Promise<void>) {
  const sessionId = getCookie(c, "session_id");

  if (!sessionId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      expiresAt: {
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });

  if (!session) {
    deleteCookie(c, "session_id");
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  (c as any).user = session.user;
  await next();
}
