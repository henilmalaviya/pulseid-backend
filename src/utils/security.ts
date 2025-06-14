import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { prisma } from "./database";

// Rate limiters for different endpoints
export const otpRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 3, // 3 OTP requests per 15 minutes per IP
  message: { error: "Too many OTP requests. Please try again later." },
  standardHeaders: true,
  keyGenerator: (c) => {
    return (
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      c.req.header("cf-connecting-ip") ||
      "unknown-ip"
    );
  },
});

export const verifyRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 verification attempts per 15 minutes per IP
  message: { error: "Too many verification attempts. Please try again later." },
  standardHeaders: true,
  keyGenerator: (c) => {
    return (
      c.req.header("x-forwarded-for") ||
      c.req.header("x-real-ip") ||
      c.req.header("cf-connecting-ip") ||
      "unknown-ip"
    );
  },
});

// Input validation schemas
export const phoneNumberSchema = z.object({
  phoneNumber: z
    .string()
    .min(10, "Phone number must be at least 10 digits")
    .max(15, "Phone number must not exceed 15 digits")
    .regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
});

export const otpSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must contain only digits"),
});

// Track failed attempts per phone number/login request
interface FailedAttempt {
  count: number;
  lastAttempt: Date;
  lockedUntil?: Date;
}

const failedAttempts = new Map<string, FailedAttempt>();

export function isLocked(identifier: string): boolean {
  const attempt = failedAttempts.get(identifier);
  if (!attempt?.lockedUntil) return false;

  if (new Date() > attempt.lockedUntil) {
    // Lock expired, reset
    failedAttempts.delete(identifier);
    return false;
  }

  return true;
}

export function recordFailedAttempt(identifier: string): number {
  const now = new Date();
  const attempt = failedAttempts.get(identifier) || {
    count: 0,
    lastAttempt: now,
  };

  // Reset count if last attempt was more than 15 minutes ago
  if (now.getTime() - attempt.lastAttempt.getTime() > 15 * 60 * 1000) {
    attempt.count = 0;
  }

  attempt.count++;
  attempt.lastAttempt = now;

  // Lock for increasing durations: 5min, 15min, 30min, 1hr
  if (attempt.count >= 3) {
    const lockDuration =
      Math.min(5 * Math.pow(2, attempt.count - 3), 60) * 60 * 1000;
    attempt.lockedUntil = new Date(now.getTime() + lockDuration);
  }

  failedAttempts.set(identifier, attempt);
  return attempt.count;
}

export function clearFailedAttempts(identifier: string): void {
  failedAttempts.delete(identifier);
}

export function getRemainingLockTime(identifier: string): number {
  const attempt = failedAttempts.get(identifier);
  if (!attempt?.lockedUntil) return 0;

  const remaining = attempt.lockedUntil.getTime() - new Date().getTime();
  return Math.max(0, Math.ceil(remaining / 1000)); // seconds
}

// Clean up old entries periodically
setInterval(() => {
  const now = new Date();
  const entries = Array.from(failedAttempts.entries());
  for (const [key, attempt] of entries) {
    // Remove entries older than 1 hour
    if (now.getTime() - attempt.lastAttempt.getTime() > 60 * 60 * 1000) {
      failedAttempts.delete(key);
    }
  }
}, 15 * 60 * 1000); // Clean every 15 minutes
