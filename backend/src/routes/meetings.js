import { Router } from "express";
import crypto from "node:crypto";
import { requireAuth } from "../middleware/auth.js";
import { Meeting } from "../models/Meeting.js";
import { Message } from "../models/Message.js";

export const meetingsRouter = Router();

meetingsRouter.use(requireAuth);

meetingsRouter.get("/", async (req, res) => {
  const meetings = await Meeting.find({
    $or: [{ hostId: req.user._id }, { "participants.email": req.user.email }]
  }).sort({ scheduledAt: -1 });
  res.json({ meetings });
});

meetingsRouter.post("/", async (req, res) => {
  if (!req.body.title || !req.body.scheduledAt) {
    return res.status(400).json({ error: "title and scheduledAt are required" });
  }
  const roomId = crypto.randomUUID();
  const meeting = await Meeting.create({
    title: req.body.title,
    description: req.body.description || "",
    hostId: req.user._id,
    hostName: req.user.name,
    scheduledAt: req.body.scheduledAt,
    durationMinutes: req.body.durationMinutes || 30,
    passcode: req.body.passcode || "",
    requireApproval: Boolean(req.body.requireApproval),
    roomId,
    participants: [
      {
        userId: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: "host",
        admitted: true
      }
    ]
  });
  res.status(201).json({ meeting });
});

meetingsRouter.get("/:id", async (req, res) => {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Not found" });
  res.json({ meeting });
});

meetingsRouter.post("/:id/join", async (req, res) => {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Not found" });
  const participant = {
    userId: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role: req.user._id.toString() === meeting.hostId.toString() ? "host" : "participant",
    joinedAt: new Date(),
    admitted: !meeting.requireApproval || req.user._id.toString() === meeting.hostId.toString()
  };
  meeting.participants.push(participant);
  meeting.status = "live";
  await meeting.save();
  res.json({ meeting, participant });
});

meetingsRouter.post("/:id/messages", async (req, res) => {
  if (!req.body.text) {
    return res.status(400).json({ error: "text is required" });
  }
  const message = await Message.create({
    meetingId: req.params.id,
    senderId: req.user._id,
    senderName: req.user.name,
    text: req.body.text
  });
  res.status(201).json({ message });
});
