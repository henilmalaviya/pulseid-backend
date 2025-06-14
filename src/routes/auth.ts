import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { prisma } from "../utils/database";
import { generateOTP, sendSMS } from "../utils/sms";

const authRoutes = new Hono();

// POST /login - Begin login process
authRoutes.post("/login", async (c) => {
  try {
    const { phoneNumber } = await c.req.json();

    if (!phoneNumber) {
      return c.json({ error: "Phone number is required" }, 400);
    }

    // Find user with this phone number
    const user = await prisma.user.findFirst({
      where: { phoneNumber },
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    if (!user.isPhoneNumberVerified) {
      return c.json({ error: "Phone number not verified" }, 400);
    }

    // Generate and store login OTP
    const otpCode = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

    const loginRequest = await prisma.loginVerificationRequest.create({
      data: {
        code: otpCode,
        userId: user.id,
        expiresAt,
      },
    });

    // Send OTP via SMS
    const smsMessage = `Your PulseID login code is: ${otpCode}`;
    await sendSMS(phoneNumber, smsMessage);

    return c.json({
      message: "Login OTP sent successfully",
      loginRequestId: loginRequest.id,
    });
  } catch (error) {
    console.error("Error in login:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /login/:id/verify - Verify login OTP
authRoutes.post("/login/:id/verify", async (c) => {
  try {
    const loginRequestId = c.req.param("id");
    const { otp } = await c.req.json();

    if (!otp) {
      return c.json({ error: "OTP is required" }, 400);
    }

    // Find valid login request
    const loginRequest = await prisma.loginVerificationRequest.findFirst({
      where: {
        id: loginRequestId,
        code: otp,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true,
      },
    });

    if (!loginRequest) {
      return c.json({ error: "Invalid or expired OTP" }, 400);
    }

    // Create session
    const sessionExpiresAt = new Date();
    sessionExpiresAt.setDate(sessionExpiresAt.getDate() + 30); // 30 days

    const session = await prisma.session.create({
      data: {
        userId: loginRequest.userId,
        expiresAt: sessionExpiresAt,
      },
    });

    // Set secure session cookie
    setCookie(c, "session_id", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    // Delete used login request
    await prisma.loginVerificationRequest.delete({
      where: { id: loginRequest.id },
    });

    return c.json({
      message: "Login successful",
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

// POST /logout - Logout and clear session
authRoutes.post("/logout", async (c) => {
  try {
    const sessionId = getCookie(c, "session_id");

    if (sessionId) {
      // Delete session from database
      await prisma.session.deleteMany({
        where: { id: sessionId },
      });
    }

    // Clear session cookie
    deleteCookie(c, "session_id");

    return c.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Error in logout:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default authRoutes;
