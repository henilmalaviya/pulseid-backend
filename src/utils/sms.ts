// Utility function to generate random OTP
export function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
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
      console.error("Invalid phone number format");
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
      console.log(`SMS sent successfully to ${cleanedNumber}`);
      return true;
    } else {
      console.error("Failed to send SMS:", result);
      return false;
    }
  } catch (error) {
    console.error("Error sending SMS:", error);
    return false;
  }
}
