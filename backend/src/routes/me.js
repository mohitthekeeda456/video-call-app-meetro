import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user._id.toString(),
      name: req.user.name,
      email: req.user.email
    }
  });
});
