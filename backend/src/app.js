import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRouter } from "./routes/auth.js";
import { meetingsRouter } from "./routes/meetings.js";
import { meRouter } from "./routes/me.js";

export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: process.env.NODE_ENV === "production" ? undefined : false
    })
  );
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error("Not allowed by CORS"));
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/meetings", meetingsRouter);

  return app;
}
