import { Router } from "express";
import crypto from "node:crypto";
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

export const meetingsRouter = Router();

meetingsRouter.use(requireAuth);

meetingsRouter.get("/", async (req, res) => {
  const meetings = await Meeting.find({
    $or: [{ hostId: req.user._id }, { "participants.email": req.user.email }]
  }).sort({ scheduledAt: -1 });
  res.json({
    meetings: meetings.map((meeting) => serializeMeeting(meeting, req.user._id))
  });
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
  const messages = await Message.find({ meetingId: meeting._id }).sort({ createdAt: 1 }).limit(50);
  res.json({
    meeting: serializeMeeting(meeting, req.user._id),
    messages
  });
});

meetingsRouter.post("/room/:roomId/access", async (req, res) => {
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

  if (meeting.passcode && !isHost && meeting.passcode !== (req.body.passcode || "")) {
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
  const messages = await Message.find({ meetingId: req.params.id }).sort({ createdAt: 1 }).limit(50);
  res.json({ messages });
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
