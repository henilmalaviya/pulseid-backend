import type { Context } from "hono";
import { prisma } from "../utils/database";

// Middleware to check authentication using Authorization header
export async function requireAuth(c: Context, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");

  // Debug logging
  console.log("=== Auth Debug ===");
  console.log("Request URL:", c.req.url);
  console.log("Request Method:", c.req.method);
  console.log("Authorization header:", authHeader);
  console.log("==================");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("No valid Authorization header found");
    return c.json({ error: "Authentication required" }, 401);
  }

  const sessionId = authHeader.substring(7); // Remove "Bearer " prefix

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
    console.log("Session not found or expired for ID:", sessionId);
    return c.json({ error: "Invalid or expired session" }, 401);
  }

  console.log("Auth successful for user:", session.user.id);
  (c as any).user = session.user;
  await next();
}
