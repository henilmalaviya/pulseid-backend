import { Hono } from "hono";
import { cors } from "hono/cors";
import userRoutes from "./routes/user";
import profileRoutes from "./routes/profile";
import authRoutes from "./routes/auth";
import webhookRoutes from "./routes/webhook";

const app = new Hono();

// Parse allowed origins from environment variable
const getAllowedOrigins = (): string[] => {
  const allowedOrigins = process.env.ALLOWED_ORIGINS;
  if (allowedOrigins) {
    return allowedOrigins.split(",").map((origin) => origin.trim());
  }

  // Fallback to default development origins if not configured
  return [
    "http://localhost:5500",
    "http://127.0.0.1:5500",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ];
};

// Enable CORS for header-based authentication (no credentials needed)
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowedOrigins = getAllowedOrigins();

      // Allow requests with no origin (like mobile apps, Postman, etc.)
      if (!origin) return origin;

      return allowedOrigins.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"], // Authorization header for tokens
  })
);

// Mount route modules
app.route("/user", userRoutes); // Handles POST /user, POST /user/:id/verify
app.route("/user", profileRoutes); // Handles GET /user/:id, PUT /user/:id
app.route("/", authRoutes); // Handles POST /login, POST /login/:id/verify, POST /logout
app.route("/webhook", webhookRoutes); // Handles POST /webhook/exotel/incoming-call

// Health check route
app.get("/", (c) => {
  return c.text("PulseID Backend API");
});

export default app;
