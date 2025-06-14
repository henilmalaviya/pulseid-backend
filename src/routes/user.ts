import { Hono } from "hono";
import { prisma } from "../utils/database";
import { generateOTP, sendSMS, hashPhoneNumber } from "../utils/sms";
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

const userRoutes = new Hono();

// POST /user - Initiate user registration
userRoutes.post("/", otpRateLimiter, async (c) => {
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
          error: "Too many registration attempts. Please try again later.",
          retryAfter: remainingTime,
        },
        429
      );
    }

    // Check if user already exists
    let user = await prisma.user.findFirst({
      where: { phoneNumber },
    });

    // Create user if doesn't exist
    if (!user) {
      user = await prisma.user.create({
        data: {
          phoneNumber,
          isPhoneNumberVerified: false,
        },
      });
    }

    // If user already verified, don't allow re-registration
    if (user.isPhoneNumberVerified) {
      return c.json(
        {
          error: "Phone number already registered and verified",
        },
        400
      );
    }

    // Clean up any existing expired verification codes for this user
    await prisma.phoneVerification.deleteMany({
      where: {
        userId: user.id,
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    // Check if there's already a valid verification code
    const existingVerification = await prisma.phoneVerification.findFirst({
      where: {
        userId: user.id,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (existingVerification) {
      return c.json({
        error:
          "OTP already sent. Please check your messages or wait for expiry before requesting a new one.",
        userId: user.id,
      });
    }

    // Generate and store OTP
    const otpCode = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 5);

    await prisma.phoneVerification.create({
      data: {
        code: otpCode,
        userId: user.id,
        expiresAt,
      },
    });

    // Send OTP via SMS
    const smsMessage = `Your PulseID verification code is: ${otpCode}. This code expires in 5 minutes.`;
    const smsSent = await sendSMS(phoneNumber, smsMessage);

    if (!smsSent) {
      // Clean up failed verification record
      await prisma.phoneVerification.deleteMany({
        where: { userId: user.id },
      });
      return c.json({ error: "Failed to send OTP. Please try again." }, 500);
    }

    console.log(`Registration OTP sent to ${hashPhoneNumber(phoneNumber)}`);

    return c.json({
      message: "OTP sent successfully",
      userId: user.id,
    });
  } catch (error) {
    console.error("Error in user registration:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /user/:id/verify - Verify registration OTP
userRoutes.post("/:id/verify", verifyRateLimiter, async (c) => {
  try {
    const userId = c.req.param("id");
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

    // Check if this user verification is locked
    if (isLocked(`verify_${userId}`)) {
      const remainingTime = getRemainingLockTime(`verify_${userId}`);
      return c.json(
        {
          error:
            "Too many failed verification attempts. Please try again later.",
          retryAfter: remainingTime,
        },
        429
      );
    }

    // Find valid OTP
    const verification = await prisma.phoneVerification.findFirst({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!verification) {
      return c.json(
        {
          error:
            "No valid verification request found. Please request a new OTP.",
        },
        400
      );
    }

    // Verify OTP
    if (verification.code !== otp) {
      // Record failed attempt
      const failedCount = recordFailedAttempt(`verify_${userId}`);

      console.log(
        `Failed registration OTP attempt ${failedCount} for ${hashPhoneNumber(
          verification.user.phoneNumber
        )}`
      );

      if (failedCount >= 3) {
        const remainingTime = getRemainingLockTime(`verify_${userId}`);
        return c.json(
          {
            error: "Too many failed attempts. Verification temporarily locked.",
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
    clearFailedAttempts(`verify_${userId}`);
    clearFailedAttempts(verification.user.phoneNumber);

    // Mark user as verified
    await prisma.user.update({
      where: { id: userId },
      data: { isPhoneNumberVerified: true },
    });

    // Delete used verification
    await prisma.phoneVerification.delete({
      where: { id: verification.id },
    });

    console.log(
      `Phone number verified successfully for ${hashPhoneNumber(
        verification.user.phoneNumber
      )}`
    );

    return c.json({ message: "Phone number verified successfully" });
  } catch (error) {
    console.error("Error in OTP verification:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default userRoutes;
