import { Server } from "socket.io";
import { User } from "./models/User.js";
import { Meeting } from "./models/Meeting.js";
import { Message } from "./models/Message.js";
import { verifyAuthToken } from "./utils/auth.js";
import {
  appendMeetingEvent,
  chooseNextHost,
  ensureParticipant,
  findParticipantIndex,
  isHostLike,
  removeParticipant,
  serializeMeeting
} from "./utils/meetingState.js";

let ioInstance = null;
const activeRooms = new Map();

function getRoomState(roomId) {
  if (!activeRooms.has(roomId)) {
    activeRooms.set(roomId, new Map());
  }
  return activeRooms.get(roomId);
}

function listActiveParticipants(roomId) {
  return [...getRoomState(roomId).values()];
}

function findSocketIdForUser(roomId, userId) {
  const participant = getRoomState(roomId).get(userId);
  return participant?.socketId || null;
}

async function handleParticipantDeparture(io, roomId, userId, actorName) {
  if (!roomId || !userId) return;

  const roomState = getRoomState(roomId);
  roomState.delete(userId);

  const meeting = await Meeting.findOne({ roomId });
  if (meeting) {
    const participantIndex = findParticipantIndex(meeting.participants, userId);
    if (participantIndex >= 0) {
      meeting.participants[participantIndex].leftAt = new Date();
      const wasHost = meeting.participants[participantIndex].role === "host";

      if (wasHost) {
        const nextHost = chooseNextHost(meeting, listActiveParticipants(roomId));
        if (nextHost) {
          meeting.hostId = nextHost.userId;
          meeting.hostName = nextHost.name;
          meeting.participants[participantIndex].role = "participant";
          nextHost.role = "host";
          appendMeetingEvent(meeting, {
            type: "host.transferred",
            actorId: userId,
            actorName,
            targetUserId: nextHost.userId?.toString(),
            targetName: nextHost.name
          });
          io.to(roomId).emit("room:host-changed", {
            hostUserId: nextHost.userId?.toString(),
            hostName: nextHost.name
          });
        }
      }

      appendMeetingEvent(meeting, {
        type: "participant.left-room",
        actorId: userId,
        actorName
      });
      await meeting.save();
    }
  }

  io.to(roomId).emit("room:participant-left", { userId });
  await emitMeetingSnapshot(roomId);
}

export async function emitMeetingSnapshot(roomId) {
  if (!ioInstance) return;
  const meeting = await Meeting.findOne({ roomId });
  if (!meeting) return;

  const controlRecipients = meeting.participants
    .filter((participant) => isHostLike(participant))
    .map((participant) => participant.userId?.toString())
    .filter(Boolean);

  for (const participant of meeting.participants) {
    const payload = serializeMeeting(meeting, participant.userId, listActiveParticipants(roomId));
    ioInstance.to(`user:${participant.userId.toString()}`).emit("room:snapshot", payload);
  }

  for (const userId of controlRecipients) {
    const payload = serializeMeeting(meeting, userId, listActiveParticipants(roomId));
    ioInstance.to(`user:${userId}`).emit("room:snapshot", payload);
  }
}

export async function emitWaitingRoomSnapshot(roomId) {
  if (!ioInstance) return;
  const meeting = await Meeting.findOne({ roomId });
  if (!meeting) return;

  const hostRecipients = meeting.participants
    .filter((participant) => isHostLike(participant))
    .map((participant) => participant.userId?.toString())
    .filter(Boolean);

  for (const userId of hostRecipients) {
    const payload = serializeMeeting(meeting, userId, listActiveParticipants(roomId));
    ioInstance.to(`user:${userId}`).emit("room:waiting-room", payload.pendingParticipants);
  }
}

async function requireMeetingAccess(roomId, userId) {
  const meeting = await Meeting.findOne({ roomId });
  if (!meeting) {
    throw new Error("Meeting not found");
  }

  const participant = meeting.participants.find((item) => item.userId?.toString() === userId.toString());
  if (!participant) {
    throw new Error("Participant not admitted");
  }

  return { meeting, participant };
}

export function registerMeetingSockets(server) {
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }
  });
  ioInstance = io;

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error("Missing token"));
      }
      const payload = verifyAuthToken(token);
      const user = await User.findById(payload.sub).select("-passwordHash");
      if (!user) {
        return next(new Error("Invalid token"));
      }
      socket.data.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email
      };
      next();
    } catch (error) {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    socket.join(`user:${socket.data.user.id}`);
    const runSafely = (handler) => async (...args) => {
      try {
        await handler(...args);
      } catch (error) {
        const callback = [...args].reverse().find((value) => typeof value === "function");
        if (callback) {
          callback({ ok: false, error: error.message });
        } else {
          socket.emit("room:error", { error: error.message });
        }
      }
    };

    socket.on("room:join", async ({ roomId }, callback = () => {}) => {
      try {
        const { meeting, participant } = await requireMeetingAccess(roomId, socket.data.user.id);
        socket.join(roomId);
        socket.data.roomId = roomId;
        socket.data.role = participant.role;

        const roomState = getRoomState(roomId);
        roomState.set(socket.data.user.id, {
          socketId: socket.id,
          userId: socket.data.user.id,
          name: socket.data.user.name,
          role: participant.role,
          micMuted: participant.micMuted ?? false,
          cameraOff: participant.cameraOff ?? false,
          isSharingScreen: participant.isSharingScreen ?? false,
          isActive: true
        });

        ensureParticipant(meeting.participants, {
          userId: socket.data.user.id,
          name: socket.data.user.name,
          email: socket.data.user.email,
          role: participant.role,
          joinedAt: participant.joinedAt || new Date(),
          leftAt: null,
          admitted: true
        });

        appendMeetingEvent(meeting, {
          type: "participant.joined-room",
          actorId: socket.data.user.id,
          actorName: socket.data.user.name
        });
        meeting.status = "live";
        await meeting.save();
        await emitMeetingSnapshot(roomId);

        callback({
          ok: true,
          existingParticipants: listActiveParticipants(roomId).filter((item) => item.userId !== socket.data.user.id)
        });
      } catch (error) {
        callback({ ok: false, error: error.message });
      }
    });

    socket.on("signal:offer", ({ roomId, targetUserId, sdp }) => {
      const targetSocketId = findSocketIdForUser(roomId, targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("signal:offer", {
          roomId,
          fromUserId: socket.data.user.id,
          fromName: socket.data.user.name,
          sdp
        });
      }
    });

    socket.on("signal:answer", ({ roomId, targetUserId, sdp }) => {
      const targetSocketId = findSocketIdForUser(roomId, targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("signal:answer", {
          roomId,
          fromUserId: socket.data.user.id,
          fromName: socket.data.user.name,
          sdp
        });
      }
    });

    socket.on("signal:ice", ({ roomId, targetUserId, candidate }) => {
      const targetSocketId = findSocketIdForUser(roomId, targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("signal:ice", {
          roomId,
          fromUserId: socket.data.user.id,
          candidate
        });
      }
    });

    socket.on("participant:update-media", runSafely(async ({ roomId, micMuted, cameraOff, isSharingScreen }) => {
      const roomState = getRoomState(roomId);
      const activeParticipant = roomState.get(socket.data.user.id);
      if (!activeParticipant) return;

      roomState.set(socket.data.user.id, {
        ...activeParticipant,
        micMuted,
        cameraOff,
        isSharingScreen
      });

      const meeting = await Meeting.findOne({ roomId });
      if (meeting) {
        const index = findParticipantIndex(meeting.participants, socket.data.user.id);
        if (index >= 0) {
          meeting.participants[index].micMuted = micMuted;
          meeting.participants[index].cameraOff = cameraOff;
          meeting.participants[index].isSharingScreen = isSharingScreen;
          await meeting.save();
        }
      }

      await emitMeetingSnapshot(roomId);
    }));

    socket.on("chat:send", runSafely(async ({ roomId, text }, callback = () => {}) => {
      const meeting = await Meeting.findOne({ roomId });
      if (!meeting || !text?.trim()) {
        return callback({ ok: false, error: "Message could not be sent" });
      }

      const message = await Message.create({
        meetingId: meeting._id,
        senderId: socket.data.user.id,
        senderName: socket.data.user.name,
        text: text.trim()
      });

      io.to(roomId).emit("chat:new", message);
      callback({ ok: true });
    }));

    socket.on("host:mute-all", runSafely(async ({ roomId }) => {
      const { meeting, participant } = await requireMeetingAccess(roomId, socket.data.user.id);
      if (!isHostLike(participant)) return;

      appendMeetingEvent(meeting, {
        type: "host.mute-all",
        actorId: socket.data.user.id,
        actorName: socket.data.user.name
      });
      await meeting.save();
      io.to(roomId).emit("meeting:mute-all");
    }));

    socket.on("host:toggle-lock", runSafely(async ({ roomId, locked }) => {
      const { meeting, participant } = await requireMeetingAccess(roomId, socket.data.user.id);
      if (!isHostLike(participant)) return;

      meeting.locked = Boolean(locked);
      appendMeetingEvent(meeting, {
        type: locked ? "host.locked-room" : "host.unlocked-room",
        actorId: socket.data.user.id,
        actorName: socket.data.user.name
      });
      await meeting.save();
      await emitMeetingSnapshot(roomId);
    }));

    socket.on("host:admit", runSafely(async ({ roomId, targetUserId }) => {
      const { meeting, participant } = await requireMeetingAccess(roomId, socket.data.user.id);
      if (!isHostLike(participant)) return;

      const pendingIndex = findParticipantIndex(meeting.pendingParticipants, targetUserId);
      if (pendingIndex < 0) return;

      const pendingParticipant = meeting.pendingParticipants[pendingIndex];
      ensureParticipant(meeting.participants, {
        ...pendingParticipant.toObject?.(),
        admitted: true,
        joinedAt: new Date(),
        leftAt: null
      });
      meeting.pendingParticipants.splice(pendingIndex, 1);
      appendMeetingEvent(meeting, {
        type: "host.admitted-participant",
        actorId: socket.data.user.id,
        actorName: socket.data.user.name,
        targetUserId: targetUserId.toString(),
        targetName: pendingParticipant.name
      });
      await meeting.save();

      io.to(`user:${targetUserId}`).emit("meeting:admitted", { roomId });
      await emitWaitingRoomSnapshot(roomId);
      await emitMeetingSnapshot(roomId);
    }));

    socket.on("host:remove", runSafely(async ({ roomId, targetUserId }) => {
      const { meeting, participant } = await requireMeetingAccess(roomId, socket.data.user.id);
      if (!isHostLike(participant)) return;

      if (!meeting.blockedParticipantIds.includes(targetUserId)) {
        meeting.blockedParticipantIds.push(targetUserId);
      }
      removeParticipant(meeting.pendingParticipants, targetUserId);
      removeParticipant(meeting.participants, targetUserId);
      appendMeetingEvent(meeting, {
        type: "host.removed-participant",
        actorId: socket.data.user.id,
        actorName: socket.data.user.name,
        targetUserId: targetUserId.toString()
      });
      await meeting.save();

      const targetSocketId = findSocketIdForUser(roomId, targetUserId);
      if (targetSocketId) {
        io.to(targetSocketId).emit("meeting:removed");
        io.sockets.sockets.get(targetSocketId)?.leave(roomId);
      }
      getRoomState(roomId).delete(targetUserId);
      await emitWaitingRoomSnapshot(roomId);
      await emitMeetingSnapshot(roomId);
    }));

    socket.on("host:make-cohost", runSafely(async ({ roomId, targetUserId }) => {
      const { meeting, participant } = await requireMeetingAccess(roomId, socket.data.user.id);
      if (participant.role !== "host") return;

      const targetIndex = findParticipantIndex(meeting.participants, targetUserId);
      if (targetIndex < 0) return;
      meeting.participants[targetIndex].role = "cohost";
      appendMeetingEvent(meeting, {
        type: "host.assigned-cohost",
        actorId: socket.data.user.id,
        actorName: socket.data.user.name,
        targetUserId: targetUserId.toString(),
        targetName: meeting.participants[targetIndex].name
      });
      await meeting.save();
      await emitMeetingSnapshot(roomId);
    }));

    socket.on("meeting:end", runSafely(async ({ roomId }) => {
      const { meeting, participant } = await requireMeetingAccess(roomId, socket.data.user.id);
      if (!isHostLike(participant)) return;

      meeting.status = "ended";
      appendMeetingEvent(meeting, {
        type: "host.ended-meeting",
        actorId: socket.data.user.id,
        actorName: socket.data.user.name
      });
      await meeting.save();
      io.to(roomId).emit("meeting:ended");
      activeRooms.delete(roomId);
      await emitMeetingSnapshot(roomId);
    }));

    socket.on("meeting:leave", runSafely(async ({ roomId }, callback = () => {}) => {
      await requireMeetingAccess(roomId, socket.data.user.id);
      const departingRoomId = roomId;
      const departingUserId = socket.data.user.id;
      const departingName = socket.data.user.name;
      socket.data.roomId = null;
      socket.data.role = null;
      callback({ ok: true });
      handleParticipantDeparture(io, departingRoomId, departingUserId, departingName).catch((error) => {
        socket.emit("room:error", { error: error.message });
      });
    }));

    socket.on("disconnect", runSafely(async () => {
      const roomId = socket.data.roomId;
      const userId = socket.data.user?.id;

      await handleParticipantDeparture(io, roomId, userId, socket.data.user.name);
    }));
  });
}
