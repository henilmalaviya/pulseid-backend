import { Hono } from "hono";
import { prisma } from "../utils/database";
import { generateOTP, sendSMS } from "../utils/sms";

const userRoutes = new Hono();

// POST /user - Initiate user registration
userRoutes.post("/", async (c) => {
  try {
    const { phoneNumber } = await c.req.json();

    if (!phoneNumber) {
      return c.json({ error: "Phone number is required" }, 400);
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

    // Generate and store OTP
    const otpCode = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiry

    await prisma.phoneVerification.create({
      data: {
        code: otpCode,
        userId: user.id,
        expiresAt,
      },
    });

    // Send OTP via SMS
    const smsMessage = `Your PulseID verification code is: ${otpCode}`;
    await sendSMS(phoneNumber, smsMessage);

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
userRoutes.post("/:id/verify", async (c) => {
  try {
    const userId = c.req.param("id");
    const { otp } = await c.req.json();

    if (!otp) {
      return c.json({ error: "OTP is required" }, 400);
    }

    // Find valid OTP
    const verification = await prisma.phoneVerification.findFirst({
      where: {
        userId,
        code: otp,
        expiresAt: {
          gt: new Date(),
        },
      },
    });

    if (!verification) {
      return c.json({ error: "Invalid or expired OTP" }, 400);
    }

    // Mark user as verified
    await prisma.user.update({
      where: { id: userId },
      data: { isPhoneNumberVerified: true },
    });

    // Delete used verification
    await prisma.phoneVerification.delete({
      where: { id: verification.id },
    });

    return c.json({ message: "Phone number verified successfully" });
  } catch (error) {
    console.error("Error in OTP verification:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default userRoutes;
