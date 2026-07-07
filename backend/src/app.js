import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { meetingsRouter } from "./routes/meetings.js";
import { meRouter } from "./routes/me.js";

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }));
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/me", meRouter);
  app.use("/api/meetings", meetingsRouter);

  return app;
}
