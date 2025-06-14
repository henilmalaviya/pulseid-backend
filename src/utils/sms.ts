import { createHash, randomBytes } from "crypto";

// Generate cryptographically secure OTP
export function generateOTP(): string {
  // Use crypto.randomBytes for cryptographically secure randomness
  const buffer = randomBytes(4);
  const randomNum = buffer.readUInt32BE(0);
  // Ensure 6 digits by using modulo and padding
  const otp = ((randomNum % 900000) + 100000).toString();
  return otp;
}

// Generate a secure random string for dummy IDs
export function generateDummyId(): string {
  return randomBytes(16).toString("hex");
}

// Hash phone number for logging without exposing actual number
export function hashPhoneNumber(phoneNumber: string): string {
  return createHash("sha256").update(phoneNumber).digest("hex").substring(0, 8);
}

// Utility function to send SMS via Fast2SMS QuickSMS
export async function sendSMS(
  phoneNumber: string,
  message: string
): Promise<boolean> {
  try {
    const apiKey = process.env.FAST2SMS_API_KEY;

    if (!apiKey) {
      console.error("Fast2SMS API key not configured");
      return false;
    }

    // Remove +91 prefix if present, remove all non-digits, and remove leading zeros
    const cleanedNumber = phoneNumber
      .replace(/^\+91/, "")
      .replace(/\D/g, "")
      .replace(/^0+/, "");

    if (cleanedNumber.length !== 10) {
      console.error(
        `Invalid phone number format for ${hashPhoneNumber(phoneNumber)}`
      );
      return false;
    }

    const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        route: "q",
        message: message,
        language: "english",
        flash: 0,
        numbers: cleanedNumber,
      }),
    });

    const result = await response.json();

    if (result.return === true) {
      console.log(`SMS sent successfully to ${hashPhoneNumber(phoneNumber)}`);
      return true;
    } else {
      console.error(
        `Failed to send SMS to ${hashPhoneNumber(phoneNumber)}:`,
        result.message || "Unknown error"
      );
      return false;
    }
  } catch (error) {
    console.error(
      `Error sending SMS to ${hashPhoneNumber(phoneNumber)}:`,
      error
    );
    return false;
  }
}
