import { Hono } from "hono";
import { prisma } from "../utils/database";
import {
  generateOTP,
  generateDummyId,
  sendSMS,
  hashPhoneNumber,
} from "../utils/sms";
import {
  otpRateLimiter,
  verifyRateLimiter,
  phoneNumberSchema,
  otpSchema,
  isLocked,
  recordFailedAttempt,
  clearFailedAttempts,
  getRemainingLockTime,
} from "../utils/security";

const authRoutes = new Hono();

// POST /login - Begin login process
authRoutes.post("/login", otpRateLimiter, async (c) => {
  try {
    const body = await c.req.json();

    // Validate input
    const validation = phoneNumberSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: "Invalid phone number format",
          details: validation.error.errors.map((e) => e.message),
        },
        400
      );
    }

    const { phoneNumber } = validation.data;

    // Check if phone number is locked due to failed attempts
    if (isLocked(phoneNumber)) {
      const remainingTime = getRemainingLockTime(phoneNumber);
      return c.json(
        {
          error: "Account temporarily locked due to too many failed attempts",
          retryAfter: remainingTime,
        },
        429
      );
    }

    // Find user with this phone number
    const user = await prisma.user.findFirst({
      where: { phoneNumber },
    });

    // ANTI-ENUMERATION: Always return same response regardless of user existence
    // Generate OTP and dummy ID even for non-existent users
    const otpCode = generateOTP();
    const dummyId = generateDummyId();

    if (!user || !user.isPhoneNumberVerified) {
      // Simulate sending OTP to prevent timing attacks
      // Add a small delay to match real OTP generation time
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 100 + 50)
      );

      // Log attempt for security monitoring (using hashed phone number)
      console.log(
        `Login attempt for unregistered/unverified number: ${hashPhoneNumber(
          phoneNumber
        )}`
      );

      return c.json({
        message:
          "If this number is registered and verified, you'll receive an OTP",
        loginRequestId: dummyId,
      });
    }

    // Real user flow
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5); // Reduced to 5 minutes

    const loginRequest = await prisma.loginVerificationRequest.create({
      data: {
        code: otpCode,
        userId: user.id,
        expiresAt,
      },
    });

    // Send OTP via SMS
    const smsMessage = `Your PulseID login code is: ${otpCode}. This code expires in 5 minutes.`;
    const smsSent = await sendSMS(phoneNumber, smsMessage);

    if (!smsSent) {
      // Clean up failed request
      await prisma.loginVerificationRequest.delete({
        where: { id: loginRequest.id },
      });
      return c.json({ error: "Failed to send OTP. Please try again." }, 500);
    }

    console.log(`Login OTP sent to ${hashPhoneNumber(phoneNumber)}`);

    return c.json({
      message:
        "If this number is registered and verified, you'll receive an OTP",
      loginRequestId: loginRequest.id,
    });
  } catch (error) {
    console.error("Error in login:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /login/:id/verify - Verify login OTP
authRoutes.post("/login/:id/verify", verifyRateLimiter, async (c) => {
  try {
    const loginRequestId = c.req.param("id");
    const body = await c.req.json();

    // Validate OTP format
    const validation = otpSchema.safeParse(body);
    if (!validation.success) {
      return c.json(
        {
          error: "Invalid OTP format",
          details: validation.error.errors.map((e) => e.message),
        },
        400
      );
    }

    const { otp } = validation.data;

    // Check if this login request is locked
    if (isLocked(`login_${loginRequestId}`)) {
      const remainingTime = getRemainingLockTime(`login_${loginRequestId}`);
      return c.json(
        {
          error: "Too many failed attempts. Please try again later.",
          retryAfter: remainingTime,
        },
        429
      );
    }

    // Find valid login request
    const loginRequest = await prisma.loginVerificationRequest.findFirst({
      where: {
        id: loginRequestId,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!loginRequest) {
      return c.json({ error: "Invalid or expired login request" }, 400);
    }

    // Verify OTP
    if (loginRequest.code !== otp) {
      // Record failed attempt
      const failedCount = recordFailedAttempt(`login_${loginRequestId}`);

      console.log(
        `Failed login OTP attempt ${failedCount} for ${hashPhoneNumber(
          loginRequest.user.phoneNumber
        )}`
      );

      if (failedCount >= 3) {
        const remainingTime = getRemainingLockTime(`login_${loginRequestId}`);
        return c.json(
          {
            error: "Too many failed attempts. Account temporarily locked.",
            retryAfter: remainingTime,
          },
          429
        );
      }

      return c.json(
        {
          error: "Invalid OTP",
          attemptsRemaining: 3 - failedCount,
        },
        400
      );
    }

    // Clear failed attempts on successful verification
    clearFailedAttempts(`login_${loginRequestId}`);
    clearFailedAttempts(loginRequest.user.phoneNumber);

    // Create session
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setDate(sessionExpiresAt.getDate() + 30); // 30 days

    const session = await prisma.session.create({
      data: {
        userId: loginRequest.userId,
        expiresAt: sessionExpiresAt,
      },
    });

    // Delete used login request
    await prisma.loginVerificationRequest.delete({
      where: { id: loginRequest.id },
    });

    console.log(
      `Successful login for ${hashPhoneNumber(loginRequest.user.phoneNumber)}`
    );

    // Return session token in response instead of setting cookie
    return c.json({
      message: "Login successful",
      sessionToken: session.id, // Send session ID as token
      user: {
        id: loginRequest.user.id,
        phoneNumber: loginRequest.user.phoneNumber,
      },
    });
  } catch (error) {
    console.error("Error in login verification:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /logout - Logout and invalidate session
authRoutes.post("/logout", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const sessionId = authHeader.substring(7);

      // Delete session from database
      await prisma.session.deleteMany({
        where: { id: sessionId },
      });
    }

    return c.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error in logout:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default authRoutes;
