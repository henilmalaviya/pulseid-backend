import { Hono } from "hono";
import { cors } from "hono/cors";
import userRoutes from "./routes/user";
import profileRoutes from "./routes/profile";
import authRoutes from "./routes/auth";
import webhookRoutes from "./routes/webhook";

const app = new Hono();

// Enable CORS for all origins
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
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
