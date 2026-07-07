import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function MeetingRoom() {
  const { roomId } = useParams();
  const socketRef = useRef(null);
  const [log, setLog] = useState([]);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socketRef.current = socket;
    socket.emit("room:join", { roomId, name: "Guest" });
    socket.on("room:presence", (event) => setLog((prev) => [...prev, `${event.name} ${event.type}ed`]));
    socket.on("meeting:mute-all", () => setMuted(true));
    socket.on("meeting:ended", () => setLog((prev) => [...prev, "Meeting ended by host"]));
    return () => socket.disconnect();
  }, [roomId]);

  return (
    <main className="page">
      <h1>Meeting room</h1>
      <p>Room ID: {roomId}</p>
      <div className="actions">
        <button className="button secondary" onClick={() => setMuted((v) => !v)}>{muted ? "Unmute" : "Mute"}</button>
        <button className="button secondary" onClick={() => setCameraOff((v) => !v)}>{cameraOff ? "Camera on" : "Camera off"}</button>
        <button className="button" onClick={() => socketRef.current?.emit("meeting:mute-all", { roomId })}>Mute all</button>
      </div>
      <section className="panel">
        <h2>Activity</h2>
        {log.map((item, index) => <div key={index}>{item}</div>)}
      </section>
    </main>
  );
}
