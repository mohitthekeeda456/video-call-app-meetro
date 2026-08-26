import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { Meeting } from "../models/Meeting.js";
import { Message } from "../models/Message.js";
import { emitMeetingSnapshot, emitWaitingRoomSnapshot } from "../sockets.js";
import {
  appendMeetingEvent,
  ensureParticipant,
  findParticipantIndex,
  removeParticipant,
  serializeMeeting
} from "../utils/meetingState.js";
import { normalizeText, validateBody } from "../utils/validation.js";

export const meetingsRouter = Router();

meetingsRouter.use(requireAuth);

const joinLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
const meetingCreateSchema = z.object({
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(120, "Title is too long"),
  scheduledAt: z.coerce.date({ error: "scheduledAt must be a valid date" }),
  durationMinutes: z.coerce.number().int().min(5, "Duration must be at least 5 minutes").max(480, "Duration is too long"),
  description: z.string().max(1000, "Description is too long").optional().default(""),
  passcode: z.string().trim().max(64, "Passcode is too long").optional().default(""),
  requireApproval: z.boolean().optional().default(true)
});
const accessSchema = z.object({
  passcode: z.string().trim().max(64, "Passcode is too long").optional().default("")
});
const messageSchema = z.object({
  text: z.string().trim().min(1, "text is required").max(1000, "Message is too long")
});

meetingsRouter.get("/", async (req, res) => {
  const meetings = await Meeting.find({
    $or: [{ hostId: req.user._id }, { "participants.email": req.user.email }]
  }).sort({ scheduledAt: -1 });
  res.json({
    meetings: meetings.map((meeting) => serializeMeeting(meeting, req.user._id))
  });
});

meetingsRouter.post("/", validateBody(meetingCreateSchema), async (req, res) => {
  const passcodeHash = req.body.passcode ? await bcrypt.hash(req.body.passcode, 10) : "";
  const roomId = crypto.randomUUID();
  const meeting = await Meeting.create({
    title: normalizeText(req.body.title, 120),
    description: normalizeText(req.body.description, 1000),
    hostId: req.user._id,
    hostName: req.user.name,
    scheduledAt: req.body.scheduledAt,
    durationMinutes: req.body.durationMinutes,
    passcode: "",
    passcodeHash,
    requireApproval: Boolean(req.body.requireApproval),
    roomId,
    participants: [
      {
        userId: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: "host",
        admitted: true,
        joinedAt: new Date()
      }
    ]
  });
  appendMeetingEvent(meeting, {
    type: "meeting.created",
    actorId: req.user._id.toString(),
    actorName: req.user.name
  });
  await meeting.save();
  res.status(201).json({ meeting: serializeMeeting(meeting, req.user._id) });
});

meetingsRouter.get("/room/:roomId", async (req, res) => {
  const meeting = await Meeting.findOne({ roomId: req.params.roomId });
  if (!meeting) return res.status(404).json({ error: "Not found" });
  const canViewMessages =
    meeting.hostId.toString() === req.user._id.toString() ||
    meeting.participants.some((participant) => participant.email === req.user.email && participant.admitted);
  const messages = canViewMessages ? await Message.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).limit(50) : [];
  res.json({
    meeting: serializeMeeting(meeting, req.user._id),
    messages
  });
});

meetingsRouter.get("/room/:roomId/highlights", async (req, res) => {
  const meeting = await Meeting.findOne({ roomId: req.params.roomId });
  if (!meeting) return res.status(404).json({ error: "Not found" });

  const canView =
    meeting.hostId.toString() === req.user._id.toString() ||
    meeting.participants.some((participant) => participant.email === req.user.email);

  if (!canView) {
    return res.status(403).json({ error: "You do not have access to this meeting" });
  }

  const messages = await Message.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).limit(200);
  res.json({
    meeting: serializeMeeting(meeting, req.user._id, [], { includeEndedParticipants: true }),
    messages,
    participantHistory: meeting.participants.map((participant) => ({
      userId: participant.userId?.toString(),
      name: participant.name,
      email: participant.email,
      role: participant.role,
      joinedAt: participant.joinedAt,
      leftAt: participant.leftAt,
      admitted: participant.admitted
    })),
    events: meeting.events
  });
});

meetingsRouter.post("/room/:roomId/access", joinLimiter, validateBody(accessSchema), async (req, res) => {
  const meeting = await Meeting.findOne({ roomId: req.params.roomId });
  if (!meeting) return res.status(404).json({ error: "Not found" });
  const isHost = meeting.hostId.toString() === req.user._id.toString();

  if (meeting.status === "ended") {
    return res.status(400).json({ error: "Meeting has already ended" });
  }

  if (meeting.blockedParticipantIds.includes(req.user._id.toString())) {
    return res.status(403).json({ error: "You were removed from this meeting" });
  }

  if (meeting.locked && !isHost) {
    return res.status(403).json({ error: "Meeting is locked" });
  }

  if (meeting.passcodeHash && !isHost) {
    const passcodeOk = await bcrypt.compare(req.body.passcode || "", meeting.passcodeHash);
    if (!passcodeOk) {
      return res.status(403).json({ error: "Incorrect passcode" });
    }
  }

  if (!meeting.passcodeHash && meeting.passcode && !isHost && meeting.passcode !== (req.body.passcode || "")) {
    return res.status(403).json({ error: "Incorrect passcode" });
  }

  const role = isHost ? "host" : "participant";
  const baseParticipant = {
    userId: req.user._id,
    name: req.user.name,
    email: req.user.email,
    role,
    joinedAt: new Date()
  };

  let accessState = "admitted";
  removeParticipant(meeting.pendingParticipants, req.user._id);

  if (meeting.requireApproval && !isHost) {
    const existingIndex = findParticipantIndex(meeting.participants, req.user._id);
    if (existingIndex === -1) {
      ensureParticipant(meeting.pendingParticipants, {
        ...baseParticipant,
        admitted: false
      });
      accessState = "waiting";
      appendMeetingEvent(meeting, {
        type: "participant.waiting",
        actorId: req.user._id.toString(),
        actorName: req.user.name
      });
    }
  }

  if (accessState === "admitted") {
    ensureParticipant(meeting.participants, {
      ...baseParticipant,
      admitted: true,
      leftAt: null
    });
    meeting.status = "live";
    appendMeetingEvent(meeting, {
      type: "participant.admitted",
      actorId: req.user._id.toString(),
      actorName: req.user.name
    });
  }

  await meeting.save();
  await emitWaitingRoomSnapshot(meeting.roomId);
  await emitMeetingSnapshot(meeting.roomId);

  const messages = await Message.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).limit(50);
  res.json({
    accessState,
    meeting: serializeMeeting(meeting, req.user._id),
    messages
  });
});

meetingsRouter.get("/:id", async (req, res) => {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Not found" });
  res.json({ meeting: serializeMeeting(meeting, req.user._id) });
});

meetingsRouter.get("/:id/messages", async (req, res) => {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Not found" });
  const canView =
    meeting.hostId.toString() === req.user._id.toString() ||
    meeting.participants.some((participant) => participant.email === req.user.email && participant.admitted);
  if (!canView) return res.status(403).json({ error: "You do not have access to these messages" });
  const messages = await Message.find({ meetingId: req.params.id }).sort({ createdAt: 1 }).limit(50);
  res.json({ messages });
});

meetingsRouter.post("/:id/messages", validateBody(messageSchema), async (req, res) => {
  const meeting = await Meeting.findById(req.params.id);
  if (!meeting) return res.status(404).json({ error: "Not found" });
  const canSend = meeting.participants.some((participant) => participant.userId?.toString() === req.user._id.toString() && participant.admitted);
  if (!canSend) return res.status(403).json({ error: "You do not have access to this meeting" });
  const message = await Message.create({
    meetingId: req.params.id,
    senderId: req.user._id,
    senderName: req.user.name,
    text: normalizeText(req.body.text, 1000)
  });
  res.status(201).json({ message });
});
