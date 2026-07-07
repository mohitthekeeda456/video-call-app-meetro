import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import { api, getStoredToken } from "../api.js";
import { useAuth } from "../auth.jsx";
import { VideoTile } from "../components/VideoTile.jsx";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";
const rtcConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

export function MeetingRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map());
  const remoteStreamsRef = useRef(new Map());
  const screenTrackRef = useRef(null);
  const passcodeRef = useRef("");
  const joinedRef = useRef(false);
  const localMediaRef = useRef({
    micMuted: false,
    cameraOff: false,
    isSharingScreen: false
  });

  const [meeting, setMeeting] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState("");
  const [passcode, setPasscode] = useState(() => searchParams.get("passcode") || "");
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [roomEnded, setRoomEnded] = useState(false);
  const [remoteVersion, setRemoteVersion] = useState(0);
  const [localPreviewStream, setLocalPreviewStream] = useState(null);
  const [localMedia, setLocalMedia] = useState(localMediaRef.current);

  const remoteParticipants = useMemo(() => {
    if (!meeting || !user) return [];
    return meeting.participants
      .filter((participant) => participant.userId !== user.id)
      .map((participant) => ({
        ...participant,
        stream: remoteStreamsRef.current.get(participant.userId) || null
      }));
  }, [meeting, remoteVersion, user]);

  useEffect(() => {
    passcodeRef.current = passcode;
  }, [passcode]);

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  useEffect(() => {
    let active = true;

    async function loadMeeting() {
      try {
        const data = await api(`/api/meetings/room/${roomId}`);
        if (!active) return;
        setMeeting(data.meeting);
        setMessages(data.messages || []);
      } catch (nextError) {
        if (active) setError(nextError.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadMeeting();
    return () => {
      active = false;
    };
  }, [roomId]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return undefined;

    const socket = io(SOCKET_URL, {
      auth: { token }
    });
    socketRef.current = socket;

    socket.on("room:snapshot", (payload) => {
      setMeeting(payload);
    });

    socket.on("room:waiting-room", (pendingParticipants) => {
      setMeeting((current) => (current ? { ...current, pendingParticipants } : current));
    });

    socket.on("meeting:admitted", async ({ roomId: admittedRoomId }) => {
      if (admittedRoomId !== roomId || joinedRef.current) return;
      setWaiting(false);
      await startJoinFlow(passcodeRef.current, true);
    });

    socket.on("meeting:removed", () => {
      teardownPeers();
      stopLocalMedia();
      setJoined(false);
      setWaiting(false);
      setError("The host removed you from this meeting.");
    });

    socket.on("meeting:mute-all", () => {
      updateAudioMuted(true);
    });

    socket.on("meeting:ended", () => {
      teardownPeers();
      stopLocalMedia();
      setJoined(false);
      setRoomEnded(true);
    });

    socket.on("room:participant-left", ({ userId: participantUserId }) => {
      closePeer(participantUserId);
    });

    socket.on("room:host-changed", ({ hostName }) => {
      setError(`Host left the meeting. ${hostName} is now the host.`);
    });

    socket.on("signal:offer", async ({ fromUserId, sdp }) => {
      await ensureLocalMedia();
      const peer = createPeerConnection(fromUserId);
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("signal:answer", { roomId, targetUserId: fromUserId, sdp: answer });
    });

    socket.on("signal:answer", async ({ fromUserId, sdp }) => {
      const peer = peersRef.current.get(fromUserId);
      if (!peer) return;
      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    });

    socket.on("signal:ice", async ({ fromUserId, candidate }) => {
      const peer = peersRef.current.get(fromUserId);
      if (!peer || !candidate) return;
      await peer.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on("chat:new", (message) => {
      setMessages((current) => [...current, message]);
    });

    socket.on("room:error", ({ error: nextError }) => {
      setError(nextError);
    });

    return () => {
      socket.disconnect();
      teardownPeers();
      stopLocalMedia();
    };
  }, [roomId]);

  function assignLocalPreview(stream) {
    setLocalPreviewStream(stream);
  }

  async function ensureLocalMedia() {
    if (localStreamRef.current) {
      assignLocalPreview(localPreviewStream || localStreamRef.current);
      return localStreamRef.current;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });

    localStreamRef.current = stream;
    assignLocalPreview(stream);
    return stream;
  }

  function stopLocalMedia() {
    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }

    setLocalPreviewStream(null);
  }

  function closePeer(userId) {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.close();
      peersRef.current.delete(userId);
    }
    remoteStreamsRef.current.delete(userId);
    setRemoteVersion((value) => value + 1);
  }

  function teardownPeers() {
    for (const participantId of [...peersRef.current.keys()]) {
      closePeer(participantId);
    }
  }

  function createPeerConnection(targetUserId) {
    const existing = peersRef.current.get(targetUserId);
    if (existing) return existing;

    const peer = new RTCPeerConnection(rtcConfig);
    peersRef.current.set(targetUserId, peer);

    const localStream = localStreamRef.current;
    if (localStream) {
      for (const track of localStream.getTracks()) {
        peer.addTrack(track, localStream);
      }
    }

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current?.emit("signal:ice", {
          roomId,
          targetUserId,
          candidate: event.candidate
        });
      }
    };

    peer.ontrack = (event) => {
      const stream = remoteStreamsRef.current.get(targetUserId) || new MediaStream();
      if (!remoteStreamsRef.current.has(targetUserId)) {
        remoteStreamsRef.current.set(targetUserId, stream);
      }

      for (const track of event.streams[0].getTracks()) {
        const exists = stream.getTracks().some((existingTrack) => existingTrack.id === track.id);
        if (!exists) {
          stream.addTrack(track);
        }
      }

      setRemoteVersion((value) => value + 1);
    };

    peer.onconnectionstatechange = () => {
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
        closePeer(targetUserId);
      }
    };

    return peer;
  }

  async function createOffersForExistingParticipants(existingParticipants) {
    for (const participant of existingParticipants) {
      const peer = createPeerConnection(participant.userId);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socketRef.current?.emit("signal:offer", {
        roomId,
        targetUserId: participant.userId,
        sdp: offer
      });
    }
  }

  function syncMediaState(nextState) {
    localMediaRef.current = nextState;
    setLocalMedia(nextState);
    socketRef.current?.emit("participant:update-media", {
      roomId,
      ...nextState
    });
  }

  function updateAudioMuted(forceValue) {
    const audioTrack = localStreamRef.current?.getAudioTracks()?.[0];
    const micMuted = typeof forceValue === "boolean" ? forceValue : !localMediaRef.current.micMuted;
    if (audioTrack) {
      audioTrack.enabled = !micMuted;
    }
    syncMediaState({ ...localMediaRef.current, micMuted });
  }

  function updateCameraOff(forceValue) {
    const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];
    const cameraOff = typeof forceValue === "boolean" ? forceValue : !localMediaRef.current.cameraOff;
    if (videoTrack && !localMediaRef.current.isSharingScreen) {
      videoTrack.enabled = !cameraOff;
    }
    syncMediaState({ ...localMediaRef.current, cameraOff });
  }

  async function replaceOutgoingVideoTrack(nextTrack) {
    for (const peer of peersRef.current.values()) {
      const sender = peer.getSenders().find((item) => item.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(nextTrack);
      }
    }
  }

  async function stopScreenShare() {
    if (!localStreamRef.current) return;
    const cameraTrack = localStreamRef.current.getVideoTracks()[0];
    if (!cameraTrack) return;

    if (screenTrackRef.current) {
      screenTrackRef.current.onended = null;
      screenTrackRef.current.stop();
      screenTrackRef.current = null;
    }

    await replaceOutgoingVideoTrack(cameraTrack);
    cameraTrack.enabled = !localMediaRef.current.cameraOff;
    assignLocalPreview(localStreamRef.current);
    syncMediaState({ ...localMediaRef.current, isSharingScreen: false });
  }

  async function toggleScreenShare() {
    if (localMediaRef.current.isSharingScreen) {
      await stopScreenShare();
      return;
    }

    const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = displayStream.getVideoTracks()[0];
    screenTrackRef.current = screenTrack;
    screenTrack.onended = () => {
      stopScreenShare().catch(() => {});
    };

    await replaceOutgoingVideoTrack(screenTrack);
    assignLocalPreview(new MediaStream([screenTrack, ...(localStreamRef.current?.getAudioTracks() || [])]));
    syncMediaState({ ...localMediaRef.current, isSharingScreen: true });
  }

  async function joinSocketRoom() {
    const socket = socketRef.current;
    if (!socket) {
      return { ok: false, error: "Socket connection is not ready yet" };
    }

    if (!socket.connected) {
      await new Promise((resolve) => {
        socket.once("connect", resolve);
      });
    }

    return new Promise((resolve) => {
      socket.emit("room:join", { roomId }, (result) => resolve(result));
    });
  }

  async function startJoinFlow(submittedPasscode, admittedFromSocket = false) {
    if (joining || roomEnded) return;

    setJoining(true);
    setError("");

    try {
      const data = await api(`/api/meetings/room/${roomId}/access`, {
        method: "POST",
        body: JSON.stringify({ passcode: submittedPasscode })
      });

      setMeeting(data.meeting);
      setMessages(data.messages || []);

      if (data.accessState === "waiting" && !admittedFromSocket) {
        setWaiting(true);
        setJoined(false);
        return;
      }

      await ensureLocalMedia();
      const joinResult = await joinSocketRoom();
      if (!joinResult?.ok) {
        throw new Error(joinResult?.error || "Could not join the meeting room");
      }

      setWaiting(false);
      setJoined(true);
      await createOffersForExistingParticipants(joinResult.existingParticipants || []);
      syncMediaState(localMediaRef.current);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setJoining(false);
    }
  }

  function sendChatMessage(event) {
    event.preventDefault();
    if (!chatText.trim()) return;

    const nextText = chatText;
    setChatText("");
    socketRef.current?.emit("chat:send", { roomId, text: nextText }, (result) => {
      if (!result?.ok) {
        setError(result?.error || "Message could not be sent");
      }
    });
  }

  const localRole = meeting?.selfRole || "participant";
  const canModerate = Boolean(meeting?.canModerate);

  if (loading) {
    return <main className="page"><div className="panel">Loading meeting...</div></main>;
  }

  if (!meeting) {
    return <main className="page"><div className="panel errorText">{error || "Meeting not found."}</div></main>;
  }

  return (
    <main className="page meetingPage">
      <section className="meetingHero panel">
        <div>
          <p className="eyebrow">{meeting.status}</p>
          <h1>{meeting.title}</h1>
          <p>{meeting.description || "No meeting description provided."}</p>
          <p>{new Date(meeting.scheduledAt).toLocaleString()}</p>
        </div>
        <div className="heroActions">
          {!joined && !waiting && !roomEnded ? (
            <>
              {meeting.hasPasscode ? (
                <input
                  value={passcode}
                  placeholder="Meeting passcode"
                  onChange={(event) => setPasscode(event.target.value)}
                />
              ) : null}
              <button className="button" onClick={() => startJoinFlow(passcode)} disabled={joining}>
                {joining ? "Joining..." : "Join meeting"}
              </button>
            </>
          ) : null}
          {waiting ? <div className="statusBadge">Waiting for the host to admit you.</div> : null}
          {roomEnded ? <div className="statusBadge statusDanger">This meeting has ended.</div> : null}
          {error ? <div className="errorText">{error}</div> : null}
        </div>
      </section>

      <section className="meetingGrid">
        <div className="videoStage">
          <div className="videoWall">
            <VideoTile
              label={`${user.name} (You)`}
              meta={`${localRole}${localMedia.isSharingScreen ? " | sharing screen" : ""}`}
              stream={localPreviewStream}
              muted
              local
            />
            {remoteParticipants.map((participant) => (
              <VideoTile
                key={participant.userId}
                label={participant.name}
                meta={`${participant.role}${participant.micMuted ? " | muted" : ""}${participant.cameraOff ? " | camera off" : ""}${participant.isSharingScreen ? " | presenting" : ""}`}
                stream={participant.stream}
              />
            ))}
          </div>

          <div className="panel controlsPanel">
            <div className="actions">
              <button className="button secondary" onClick={() => updateAudioMuted()} disabled={!joined}>
                {localMedia.micMuted ? "Unmute" : "Mute"}
              </button>
              <button className="button secondary" onClick={() => updateCameraOff()} disabled={!joined}>
                {localMedia.cameraOff ? "Camera on" : "Camera off"}
              </button>
              <button className="button secondary" onClick={() => toggleScreenShare()} disabled={!joined}>
                {localMedia.isSharingScreen ? "Stop share" : "Share screen"}
              </button>
              {canModerate ? (
                <button className="button secondary" onClick={() => socketRef.current?.emit("host:mute-all", { roomId })} disabled={!joined}>
                  Mute all
                </button>
              ) : null}
              {canModerate ? (
                <button className="button secondary" onClick={() => socketRef.current?.emit("host:toggle-lock", { roomId, locked: !meeting.locked })} disabled={!joined}>
                  {meeting.locked ? "Unlock room" : "Lock room"}
                </button>
              ) : null}
              {canModerate ? (
                <button className="button dangerButton" onClick={() => socketRef.current?.emit("meeting:end", { roomId })} disabled={!joined}>
                  End meeting
                </button>
              ) : (
                <button className="button secondary" onClick={() => navigate("/")} disabled={!joined && !waiting}>
                  Leave page
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="sideRail">
          <section className="panel">
            <div className="sectionHeader">
              <h2>Participants</h2>
              <span>{meeting.participants.length}</span>
            </div>
            <div className="participantList">
              {meeting.participants.map((participant) => (
                <div className="participantRow" key={participant.userId}>
                  <div>
                    <strong>{participant.name}</strong>
                    <p>{participant.role}{participant.isActive ? " | live" : ""}</p>
                  </div>
                  {canModerate && participant.userId !== user.id ? (
                    <div className="participantActions">
                      {localRole === "host" && participant.role === "participant" ? (
                        <button className="chipButton" onClick={() => socketRef.current?.emit("host:make-cohost", { roomId, targetUserId: participant.userId })}>
                          Make co-host
                        </button>
                      ) : null}
                      <button className="chipButton chipDanger" onClick={() => socketRef.current?.emit("host:remove", { roomId, targetUserId: participant.userId })}>
                        Remove
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {canModerate ? (
            <section className="panel">
              <div className="sectionHeader">
                <h2>Waiting room</h2>
                <span>{meeting.pendingParticipants.length}</span>
              </div>
              {meeting.pendingParticipants.length === 0 ? <p>No one is waiting right now.</p> : null}
              <div className="participantList">
                {meeting.pendingParticipants.map((participant) => (
                  <div className="participantRow" key={participant.userId}>
                    <div>
                      <strong>{participant.name}</strong>
                      <p>{participant.email}</p>
                    </div>
                    <div className="participantActions">
                      <button className="chipButton" onClick={() => socketRef.current?.emit("host:admit", { roomId, targetUserId: participant.userId })}>
                        Admit
                      </button>
                      <button className="chipButton chipDanger" onClick={() => socketRef.current?.emit("host:remove", { roomId, targetUserId: participant.userId })}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="sectionHeader">
              <h2>Chat</h2>
            </div>
            <div className="chatFeed">
              {messages.map((message) => (
                <article className="chatMessage" key={message._id || `${message.senderName}-${message.createdAt}`}>
                  <strong>{message.senderName}</strong>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
            <form className="chatComposer" onSubmit={sendChatMessage}>
              <input value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Send a message" disabled={!joined} />
              <button className="button" type="submit" disabled={!joined}>Send</button>
            </form>
          </section>
        </aside>
      </section>
    </main>
  );
}
