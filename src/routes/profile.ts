import { Hono } from "hono";
import { prisma } from "../utils/database";
import { requireAuth } from "../middleware/auth";

const profileRoutes = new Hono();

// GET /:id - Get public user information (mounted under /user)
profileRoutes.get("/:id", async (c) => {
  try {
    const userId = c.req.param("id");
    const authHeader = c.req.header("Authorization");

    // Check if user is authenticated (optional for additional info)
    let isAuthenticated = false;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const sessionId = authHeader.substring(7);
      const session = await prisma.session.findFirst({
        where: {
          id: sessionId,
          expiresAt: { gt: new Date() },
        },
      });
      isAuthenticated = !!session && session.userId === userId;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Return basic public information
    const publicInfo: any = {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      bloodType: user.bloodType,
      isPhoneNumberVerified: user.isPhoneNumberVerified,
    };

    // If authenticated as the same user, include more information
    if (isAuthenticated) {
      publicInfo.phoneNumber = user.phoneNumber;
      publicInfo.dateOfBirth = user.dateOfBirth;
      publicInfo.gender = user.gender;
      publicInfo.allergies = user.allergies;
      publicInfo.conditions = user.conditions;
      publicInfo.medications = user.medications;
      publicInfo.address = user.address;
      publicInfo.city = user.city;
      publicInfo.state = user.state;
      publicInfo.zip = user.zip;
      publicInfo.country = user.country;
    }

    return c.json(publicInfo);
  } catch (error) {
    console.error("Error fetching user:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PUT /:id - Update user information (authenticated, mounted under /user)
profileRoutes.put("/:id", requireAuth, async (c) => {
  try {
    const userId = c.req.param("id");
    const currentUser = (c as any).user;

    // Ensure user can only update their own profile
    if (currentUser.id !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const updateData = await c.req.json();

    // Allow updating only specific fields
    const allowedFields = [
      "firstName",
      "lastName",
      "dateOfBirth",
      "gender",
      "bloodType",
      "allergies",
      "conditions",
      "medications",
      "address",
      "city",
      "state",
      "zip",
      "country",
    ];

    const filteredData: any = {};
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        filteredData[field] = updateData[field];
      }
    }

    if (Object.keys(filteredData).length === 0) {
      return c.json({ error: "No valid fields to update" }, 400);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: filteredData,
    });

    return c.json({
      message: "User updated successfully",
      user: {
        id: updatedUser.id,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        phoneNumber: updatedUser.phoneNumber,
        dateOfBirth: updatedUser.dateOfBirth,
        gender: updatedUser.gender,
        bloodType: updatedUser.bloodType,
        allergies: updatedUser.allergies,
        conditions: updatedUser.conditions,
        medications: updatedUser.medications,
        address: updatedUser.address,
        city: updatedUser.city,
        state: updatedUser.state,
        zip: updatedUser.zip,
        country: updatedUser.country,
      },
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default profileRoutes;
