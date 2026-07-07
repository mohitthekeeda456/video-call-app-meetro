import { Server } from "socket.io";
import { Meeting } from "./models/Meeting.js";

export function registerMeetingSockets(server) {
  const io = new Server(server, {
    cors: { origin: process.env.CLIENT_ORIGIN || "http://localhost:5173", credentials: true }
  });

  io.on("connection", (socket) => {
    socket.on("room:join", async ({ roomId, name }) => {
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.name = name;
      io.to(roomId).emit("room:presence", { type: "join", name });
    });

    socket.on("signal:offer", (payload) => socket.to(payload.roomId).emit("signal:offer", payload));
    socket.on("signal:answer", (payload) => socket.to(payload.roomId).emit("signal:answer", payload));
    socket.on("signal:ice", (payload) => socket.to(payload.roomId).emit("signal:ice", payload));

    socket.on("meeting:mute-all", ({ roomId }) => io.to(roomId).emit("meeting:mute-all"));
    socket.on("meeting:end", async ({ roomId }) => {
      const meeting = await Meeting.findOne({ roomId });
      if (meeting) {
        meeting.status = "ended";
        await meeting.save();
      }
      io.to(roomId).emit("meeting:ended");
    });

    socket.on("disconnect", () => {
      if (socket.data.roomId && socket.data.name) {
        io.to(socket.data.roomId).emit("room:presence", { type: "leave", name: socket.data.name });
      }
    });
  });
}
