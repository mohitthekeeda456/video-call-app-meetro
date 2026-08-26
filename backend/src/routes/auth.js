import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { PendingLoginOtp } from "../models/PendingLoginOtp.js";
import { PendingRegistration } from "../models/PendingRegistration.js";
import { User } from "../models/User.js";
import { sendVerificationOtp } from "../utils/email.js";
import { signAuthToken } from "../utils/auth.js";
import { normalizeText, validateBody } from "../utils/validation.js";

export const authRouter = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });
const otpLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false });
const otpSchema = z.string().regex(/^\d{6}$/, "OTP must be a 6 digit code");
const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");
const registerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80, "Name is too long"),
  email: emailSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(128, "Password is too long")
});
const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required").max(128, "Password is too long")
});
const verifySchema = z.object({
  email: emailSchema,
  otp: otpSchema
});

function createOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

function publicUser(user) {
  return { id: user._id.toString(), name: user.name, email: user.email };
}

authRouter.post("/register", authLimiter, validateBody(registerSchema), async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = email;
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(409).json({ error: "Account already exists" });
  }

  const otp = createOtp();
  const passwordHash = await bcrypt.hash(password, 10);
  const otpHash = await bcrypt.hash(otp, 10);

  await PendingRegistration.findOneAndUpdate(
    { email: normalizedEmail },
    {
      name: normalizeText(name, 80),
      email: normalizedEmail,
      passwordHash,
      otpHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const delivery = await sendVerificationOtp({ email: normalizedEmail, name, otp, purpose: "signup" });
  if (delivery.failed) {
    await PendingRegistration.deleteOne({ email: normalizedEmail });
    return res.status(503).json({ error: "Email verification is not available right now" });
  }
  res.status(202).json({
    pendingVerification: true,
    email: normalizedEmail,
    message: delivery.devOnly ? "Verification OTP generated. Check the backend terminal in local dev." : "Verification OTP sent to your email."
  });
});

authRouter.post("/verify-registration", otpLimiter, validateBody(verifySchema), async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = email;
  const pending = await PendingRegistration.findOne({ email: normalizedEmail });
  if (!pending) {
    return res.status(400).json({ error: "Verification request expired or not found" });
  }
  if (pending.expiresAt < new Date()) {
    await PendingRegistration.deleteOne({ email: normalizedEmail });
    return res.status(400).json({ error: "Verification code expired" });
  }
  if (pending.attempts >= 5) {
    await PendingRegistration.deleteOne({ email: normalizedEmail });
    return res.status(429).json({ error: "Too many attempts. Please register again." });
  }

  const ok = await bcrypt.compare(otp, pending.otpHash);
  if (!ok) {
    pending.attempts += 1;
    await pending.save();
    return res.status(400).json({ error: "Invalid verification code" });
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    await PendingRegistration.deleteOne({ email: normalizedEmail });
    return res.status(409).json({ error: "Account already exists" });
  }

  const user = await User.create({
    name: pending.name,
    email: pending.email,
    passwordHash: pending.passwordHash
  });
  await PendingRegistration.deleteOne({ email: normalizedEmail });
  const token = signAuthToken(user);
  res.status(201).json({ token, user: publicUser(user) });
});

authRouter.post("/login", authLimiter, validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Invalid credentials" });

  const otp = createOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  await PendingLoginOtp.findOneAndUpdate(
    { userId: user._id },
    {
      userId: user._id,
      email: user.email,
      otpHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      attempts: 0
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const delivery = await sendVerificationOtp({ email: user.email, name: user.name, otp, purpose: "login" });
  if (delivery.failed) {
    await PendingLoginOtp.deleteOne({ userId: user._id });
    return res.status(503).json({ error: "Login verification is not available right now" });
  }
  res.status(202).json({
    pendingLoginVerification: true,
    email: user.email,
    message: delivery.devOnly ? "Login OTP generated. Check the backend terminal in local dev." : "Login OTP sent to your email."
  });
});

authRouter.post("/verify-login", otpLimiter, validateBody(verifySchema), async (req, res) => {
  const { email, otp } = req.body;
  const pending = await PendingLoginOtp.findOne({ email });
  if (!pending) {
    return res.status(400).json({ error: "Login verification request expired or not found" });
  }
  if (pending.expiresAt < new Date()) {
    await PendingLoginOtp.deleteOne({ email });
    return res.status(400).json({ error: "Login verification code expired" });
  }
  if (pending.attempts >= 5) {
    await PendingLoginOtp.deleteOne({ email });
    return res.status(429).json({ error: "Too many attempts. Please login again." });
  }

  const ok = await bcrypt.compare(otp, pending.otpHash);
  if (!ok) {
    pending.attempts += 1;
    await pending.save();
    return res.status(400).json({ error: "Invalid verification code" });
  }

  const user = await User.findById(pending.userId);
  if (!user) {
    await PendingLoginOtp.deleteOne({ email });
    return res.status(400).json({ error: "Invalid login request" });
  }

  await PendingLoginOtp.deleteOne({ email });
  const token = signAuthToken(user);
  res.json({ token, user: publicUser(user) });
});
