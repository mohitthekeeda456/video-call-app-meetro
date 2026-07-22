import { Router } from "express";
import bcrypt from "bcryptjs";
import { User } from "../models/User.js";
import { signAuthToken } from "../utils/auth.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email and password are required" });
  }
  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    return res.status(409).json({ error: "Account already exists" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name, email, passwordHash });
  const token = signAuthToken(user);
  res.status(201).json({ token, user: { id: user._id.toString(), name: user.name, email: user.email } });
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });
  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Invalid credentials" });
  const token = signAuthToken(user);
  res.json({ token, user: { id: user._id.toString(), name: user.name, email: user.email } });
});
