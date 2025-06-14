import { Hono } from "hono";
import { prisma } from "../utils/database";
import { sendSMS, hashPhoneNumber } from "../utils/sms";

const webhookRoutes = new Hono();

// GET /webhook/exotel/incoming-call - Handle incoming call webhook from Exotel
webhookRoutes.get("/exotel/incoming-call", async (c) => {
  try {
    const url = new URL(c.req.url);
    const allParams = Object.fromEntries(url.searchParams.entries());

    // Log webhook received without exposing sensitive data
    console.log("Webhook received from Exotel");

    // Extract phone number from the incoming call
    const incomingPhoneNumber = allParams.CallFrom || allParams.From;

    if (incomingPhoneNumber) {
      // Clean the phone number (remove any non-digit characters except +)
      const cleanedPhoneNumber = incomingPhoneNumber.replace(/[^\d+]/g, "");

      // Search for user in database by phone number
      const user = await prisma.user.findFirst({
        where: {
          phoneNumber: {
            in: [
              incomingPhoneNumber,
              cleanedPhoneNumber,
              // Also try with +91 prefix variations
              `+91${incomingPhoneNumber}`,
              `+91${cleanedPhoneNumber}`,
              // Try without leading zero if present
              incomingPhoneNumber.replace(/^0/, ""),
              cleanedPhoneNumber.replace(/^0/, ""),
            ],
          },
        },
      });

      if (user) {
        // Prepare user information message
        let userInfo = `Hello ${user.firstName || ""} ${
          user.lastName || ""
        }!\n\nYour PulseID Information:\n`;
        userInfo += `Phone: ${user.phoneNumber}\n`;

        if (user.firstName || user.lastName) {
          userInfo +=
            `Name: ${user.firstName || ""} ${user.lastName || ""}`.trim() +
            "\n";
        }

        if (user.dateOfBirth) {
          userInfo += `DOB: ${user.dateOfBirth}\n`;
        }

        if (user.bloodType) {
          userInfo += `Blood Type: ${user.bloodType}\n`;
        }

        if (user.allergies) {
          userInfo += `Allergies: ${user.allergies}\n`;
        }

        if (user.conditions) {
          userInfo += `Medical Conditions: ${user.conditions}\n`;
        }

        if (user.medications) {
          userInfo += `Medications: ${user.medications}\n`;
        }

        if (user.address) {
          userInfo += `Address: ${user.address}`;
          if (user.city) userInfo += `, ${user.city}`;
          if (user.state) userInfo += `, ${user.state}`;
          if (user.zip) userInfo += ` ${user.zip}`;
          userInfo += "\n";
        }

        // Send SMS with user information
        const smsResult = await sendSMS(user.phoneNumber, userInfo);

        console.log(
          `Emergency info sent to registered user ${hashPhoneNumber(
            user.phoneNumber
          )}`
        );

        return c.json({
          status: "success",
          message: "User found and SMS sent",
          smsSent: smsResult,
        });
      } else {
        // Send SMS to inform that user is not registered
        const notFoundMessage = `Hello! We received a call from your number, but you don't appear to be registered with PulseID. Please register at our platform to access your medical information during emergencies.`;

        const smsResult = await sendSMS(incomingPhoneNumber, notFoundMessage);

        console.log(
          `Emergency call from unregistered number ${hashPhoneNumber(
            incomingPhoneNumber
          )}`
        );

        return c.json({
          status: "success",
          message: "User not found, notification SMS sent",
          smsSent: smsResult,
        });
      }
    }

    console.log("Webhook processed but no phone number found in parameters");

    return c.json({
      status: "success",
      message: "Webhook processed",
    });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return c.json(
      {
        status: "error",
        message: "Webhook processing failed",
      },
      200 // Return 200 to prevent webhook retries
    );
  }
});

export default webhookRoutes;
