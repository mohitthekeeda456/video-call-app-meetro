import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
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

function formatMessageTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

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
  const chatScrollRef = useRef(null);
  const localMediaRef = useRef({
    micMuted: false,
    micLocked: false,
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
  const [leaving, setLeaving] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [mediaWarning, setMediaWarning] = useState("");
  const currentUserId = user?.id || user?._id;

  const remoteParticipants = useMemo(() => {
    if (!meeting || !currentUserId) return [];
    return meeting.participants
      .filter((participant) => participant.userId !== currentUserId)
      .map((participant) => ({
        ...participant,
        stream: remoteStreamsRef.current.get(participant.userId) || null
      }));
  }, [currentUserId, meeting, remoteVersion]);

  useEffect(() => {
    passcodeRef.current = passcode;
  }, [passcode]);

  useEffect(() => {
    joinedRef.current = joined;
  }, [joined]);

  useEffect(() => {
    if (meeting?.status === "ended" && !joined) {
      navigate(`/meeting/${roomId}/highlights`, { replace: true });
    }
  }, [joined, meeting?.status, navigate, roomId]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [messages]);

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

    socket.on("meeting:media-control", ({ micMuted, micLocked, reason }) => {
      applyRemoteMediaControl({ micMuted, micLocked, reason });
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

  function getMediaErrorMessage(nextError) {
    if (["NotAllowedError", "PermissionDeniedError"].includes(nextError?.name)) {
      return "Camera or microphone permission was denied. You joined without local audio/video, but you can still watch, listen, and chat.";
    }

    if (["NotReadableError", "TrackStartError"].includes(nextError?.name)) {
      return "Your camera or microphone is already being used by another browser or app. You joined receive-only for now.";
    }

    return nextError?.message || "Could not access camera or microphone. You joined receive-only for now.";
  }

  async function requestUserMedia(constraints) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Media devices are not available in this browser.");
    }

    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async function ensureLocalMedia() {
    if (localStreamRef.current) {
      assignLocalPreview(localStreamRef.current.getTracks().length ? localPreviewStream || localStreamRef.current : null);
      return localStreamRef.current;
    }

    const attempts = [
      { constraints: { audio: true, video: true }, warning: "" },
      { constraints: { audio: true, video: false }, warning: "Camera is unavailable, so you joined with microphone only." },
      { constraints: { audio: false, video: true }, warning: "Microphone is unavailable, so you joined with camera only." }
    ];

    let lastError = null;
    for (const attempt of attempts) {
      try {
        const stream = await requestUserMedia(attempt.constraints);
        localStreamRef.current = stream;
        assignLocalPreview(stream);
        setMediaWarning(attempt.warning);
        return stream;
      } catch (nextError) {
        lastError = nextError;
      }
    }

    const emptyStream = new MediaStream();
    localStreamRef.current = emptyStream;
    assignLocalPreview(null);
    setMediaWarning(getMediaErrorMessage(lastError));
    syncMediaState({ ...localMediaRef.current, micMuted: true, cameraOff: true });
    return emptyStream;
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

    const hasAudioSender = peer.getSenders().some((sender) => sender.track?.kind === "audio");
    const hasVideoSender = peer.getSenders().some((sender) => sender.track?.kind === "video");

    if (!hasAudioSender) {
      peer.addTransceiver("audio", { direction: "recvonly" });
    }

    if (!hasVideoSender) {
      peer.addTransceiver("video", { direction: "recvonly" });
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

      const incomingTracks = event.streams[0]?.getTracks?.() || [event.track];
      for (const track of incomingTracks) {
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

  function applyRemoteMediaControl({ micMuted, micLocked, reason }) {
    const audioTrack = localStreamRef.current?.getAudioTracks()?.[0];
    if (audioTrack) {
      audioTrack.enabled = !micMuted;
    }
    localMediaRef.current = {
      ...localMediaRef.current,
      micMuted: Boolean(micMuted),
      micLocked: Boolean(micLocked)
    };
    setLocalMedia(localMediaRef.current);
    if (reason) {
      setMediaWarning(reason);
    }
  }

  function updateAudioMuted(forceValue) {
    const audioTrack = localStreamRef.current?.getAudioTracks()?.[0];
    const micMuted = typeof forceValue === "boolean" ? forceValue : !localMediaRef.current.micMuted;
    if (localMediaRef.current.micLocked && !micMuted) {
      setMediaWarning("A host muted you. You can unmute after a host allows it.");
      return;
    }
    if (!audioTrack && !micMuted) {
      setMediaWarning("No microphone track is available yet. Check browser permission or close another app using the mic.");
    }
    if (audioTrack) {
      audioTrack.enabled = !micMuted;
    }
    syncMediaState({ ...localMediaRef.current, micMuted });
  }

  function updateCameraOff(forceValue) {
    const videoTrack = localStreamRef.current?.getVideoTracks()?.[0];
    const cameraOff = typeof forceValue === "boolean" ? forceValue : !localMediaRef.current.cameraOff;
    if (!videoTrack && !cameraOff) {
      setMediaWarning("No camera track is available yet. Check browser permission or close another app using the camera.");
    }
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
    try {
      if (localMediaRef.current.isSharingScreen) {
        await stopScreenShare();
        return;
      }

      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error("Screen sharing is not available in this browser.");
      }

      const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = displayStream.getVideoTracks()[0];
      screenTrackRef.current = screenTrack;
      screenTrack.onended = () => {
        stopScreenShare().catch(() => {});
      };

      await replaceOutgoingVideoTrack(screenTrack);
      assignLocalPreview(new MediaStream([screenTrack, ...(localStreamRef.current?.getAudioTracks() || [])]));
      setMediaWarning("");
      syncMediaState({ ...localMediaRef.current, isSharingScreen: true });
    } catch (nextError) {
      setMediaWarning(nextError?.message || "Screen sharing was cancelled or blocked.");
    }
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

  async function copyInvite() {
    const inviteUrl = `${window.location.origin}/meeting/${roomId}`;
    const inviteText = meeting.hasPasscode ? `${inviteUrl}\nPasscode: share the host-defined passcode` : inviteUrl;
    await navigator.clipboard.writeText(inviteText);
    setCopiedInvite(true);
    window.setTimeout(() => setCopiedInvite(false), 1800);
  }

  async function leaveMeeting() {
    if (leaving) return;
    setLeaving(true);
    setError("");

    try {
      teardownPeers();
      stopLocalMedia();
      if (socketRef.current?.connected) {
        await new Promise((resolve) => {
          socketRef.current.emit("meeting:leave", { roomId }, () => resolve());
        });
      }
      socketRef.current?.disconnect();
      setJoined(false);
      setWaiting(false);
      navigate("/");
    } finally {
      setLeaving(false);
    }
  }

  const localRole = meeting?.selfRole || "participant";
  const canModerate = Boolean(meeting?.canModerate);
  const scheduledEndAt = meeting ? new Date(new Date(meeting.scheduledAt).getTime() + meeting.durationMinutes * 60 * 1000) : null;
  const canRemoveParticipant = (participant) => {
    if (!canModerate || participant.userId === currentUserId) return false;
    if (localRole === "host") return participant.role === "cohost" || participant.role === "participant";
    if (localRole === "cohost") return participant.role === "participant";
    return false;
  };
  const canControlParticipantAudio = (participant) => canRemoveParticipant(participant);

  if (loading) {
    return (
      <main className="grid flex-1 place-items-center">
        <div className="rounded-lg border border-white/70 bg-white/90 px-6 py-5 text-sm font-semibold text-slate-600 shadow-xl shadow-slate-900/5">
          Loading meeting...
        </div>
      </main>
    );
  }

  if (!meeting) {
    return (
      <main className="grid flex-1 place-items-center">
        <div className="rounded-lg border border-red-200 bg-red-50 px-6 py-5 text-sm font-semibold text-red-700">
          {error || "Meeting not found."}
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 pb-10">
      <section className="mb-5 grid gap-4 rounded-lg border border-white/70 bg-white/90 p-5 shadow-xl shadow-slate-950/5 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-cyan-100 px-2.5 py-1 text-xs font-black uppercase tracking-normal text-cyan-800">{meeting.status}</span>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{localRole}</span>
            {meeting.locked ? <span className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">Locked</span> : null}
          </div>
          <h1 className="truncate text-3xl font-black text-slate-950">{meeting.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{meeting.description || "No meeting description provided."}</p>
          <p className="mt-3 text-sm font-semibold text-slate-600">
            Starts {new Date(meeting.scheduledAt).toLocaleString()} | Planned for {meeting.durationMinutes} min
            {scheduledEndAt ? ` | Ends around ${scheduledEndAt.toLocaleTimeString()}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:-translate-y-0.5 hover:shadow-md" onClick={copyInvite}>
              {copiedInvite ? "Invite copied" : "Copy invite"}
            </button>
            <span className="max-w-full truncate rounded-md border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-500">Room ID: {roomId}</span>
          </div>
        </div>
        <div className="grid content-start gap-3 rounded-lg bg-slate-950 p-4 text-white">
          {meeting.status === "ended" ? (
            <div className="grid gap-3">
              <div className="rounded-md border border-cyan-300/40 bg-cyan-300/10 px-4 py-3 text-sm font-semibold text-cyan-100">
                This meeting has ended. The live room is closed.
              </div>
              <Link className="rounded-md bg-cyan-400 px-5 py-3 text-center font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300" to={`/meeting/${roomId}/highlights`}>
                View highlights
              </Link>
            </div>
          ) : null}
          {!joined && !waiting && !roomEnded && meeting.status !== "ended" ? (
            <>
              {meeting.hasPasscode ? (
                <input
                  className="rounded-md border border-white/10 bg-white px-4 py-3 text-slate-950 outline-none transition focus:ring-4 focus:ring-cyan-300/30"
                  value={passcode}
                  placeholder="Meeting passcode"
                  onChange={(event) => setPasscode(event.target.value)}
                />
              ) : null}
              <button className="rounded-md bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:-translate-y-0.5 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60" onClick={() => startJoinFlow(passcode)} disabled={joining}>
                {joining ? "Joining..." : "Join meeting"}
              </button>
            </>
          ) : null}
          {waiting ? <div className="rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">Waiting for the host to admit you.</div> : null}
          {roomEnded ? <div className="rounded-md border border-red-300/40 bg-red-300/10 px-4 py-3 text-sm font-semibold text-red-100">This meeting has ended.</div> : null}
          {error ? <div className="rounded-md border border-red-300/40 bg-red-300/10 px-4 py-3 text-sm font-semibold text-red-100">{error}</div> : null}
          {mediaWarning ? <div className="rounded-md border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-semibold text-amber-100">{mediaWarning}</div> : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_380px]">
        <div className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
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

          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/5">
            <div className="flex flex-wrap gap-2">
              <button className={`rounded-md px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${localMedia.micMuted ? "bg-red-100 text-red-700 hover:bg-red-200" : "bg-slate-950 text-white hover:bg-cyan-700"}`} onClick={() => updateAudioMuted()} disabled={!joined}>
                {localMedia.micMuted ? (localMedia.micLocked ? "Muted by host" : "Unmute") : "Mute"}
              </button>
              <button className={`rounded-md px-4 py-2 text-sm font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${localMedia.cameraOff ? "bg-amber-100 text-amber-800 hover:bg-amber-200" : "bg-slate-100 text-slate-800 hover:bg-slate-200"}`} onClick={() => updateCameraOff()} disabled={!joined}>
                {localMedia.cameraOff ? "Camera on" : "Camera off"}
              </button>
              <button className="rounded-md bg-slate-100 px-4 py-2 text-sm font-black text-slate-800 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => toggleScreenShare()} disabled={!joined}>
                {localMedia.isSharingScreen ? "Stop share" : "Share screen"}
              </button>
              {canModerate ? (
                <button className="rounded-md bg-cyan-50 px-4 py-2 text-sm font-black text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => socketRef.current?.emit("host:mute-all", { roomId })} disabled={!joined}>
                  Mute all
                </button>
              ) : null}
              {canModerate ? (
                <button className="rounded-md bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => socketRef.current?.emit("host:unmute-all", { roomId })} disabled={!joined}>
                  Unmute all
                </button>
              ) : null}
              {canModerate ? (
                <button className="rounded-md bg-slate-100 px-4 py-2 text-sm font-black text-slate-800 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => socketRef.current?.emit("host:toggle-lock", { roomId, locked: !meeting.locked })} disabled={!joined}>
                  {meeting.locked ? "Unlock room" : "Lock room"}
                </button>
              ) : null}
              {canModerate ? (
                <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50" onClick={() => socketRef.current?.emit("meeting:end", { roomId })} disabled={!joined}>
                  End meeting
                </button>
              ) : (
                <button className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={leaveMeeting} disabled={leaving || (!joined && !waiting)}>
                  {leaving ? "Leaving..." : "Leave meeting"}
                </button>
              )}
              {canModerate ? (
                <button className="rounded-md border border-slate-200 px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" onClick={leaveMeeting} disabled={leaving || !joined}>
                  {leaving ? "Leaving..." : "Leave meeting"}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <aside className="grid content-start gap-4">
          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-950">Participants</h2>
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">{meeting.participants.length}</span>
            </div>
            <div className="grid gap-2">
              {meeting.participants.map((participant) => (
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3" key={participant.userId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-slate-950">{participant.name}</strong>
                      <p className="text-xs font-semibold text-slate-500">{participant.role}{participant.isActive ? " | live" : ""}{participant.micLocked ? " | muted by host" : participant.micMuted ? " | muted" : ""}</p>
                    </div>
                    {participant.isActive ? <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" /> : null}
                  </div>
                  {canRemoveParticipant(participant) || canControlParticipantAudio(participant) || (localRole === "host" && participant.role === "participant") ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {localRole === "host" && participant.role === "participant" ? (
                        <button className="rounded-md bg-cyan-100 px-3 py-1.5 text-xs font-black text-cyan-800 transition hover:bg-cyan-200" onClick={() => socketRef.current?.emit("host:make-cohost", { roomId, targetUserId: participant.userId })}>
                          Make co-host
                        </button>
                      ) : null}
                      {canControlParticipantAudio(participant) ? (
                        <button className="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-black text-slate-800 transition hover:bg-slate-300" onClick={() => socketRef.current?.emit("host:set-participant-mute", { roomId, targetUserId: participant.userId, muted: !participant.micLocked })}>
                          {participant.micLocked ? "Allow unmute" : "Mute"}
                        </button>
                      ) : null}
                      {canRemoveParticipant(participant) ? (
                        <button className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-black text-red-700 transition hover:bg-red-200" onClick={() => socketRef.current?.emit("host:remove", { roomId, targetUserId: participant.userId })}>
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          {canModerate ? (
            <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-lg font-black text-slate-950">Waiting room</h2>
                <span className="rounded-md bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800">{meeting.pendingParticipants.length}</span>
              </div>
              {meeting.pendingParticipants.length === 0 ? <p className="text-sm font-semibold text-slate-500">No one is waiting right now.</p> : null}
              <div className="grid gap-2">
                {meeting.pendingParticipants.map((participant) => (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3" key={participant.userId}>
                    <div className="min-w-0">
                      <strong className="block truncate text-sm text-slate-950">{participant.name}</strong>
                      <p className="truncate text-xs font-semibold text-slate-500">{participant.email}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-black text-white transition hover:bg-emerald-700" onClick={() => socketRef.current?.emit("host:admit", { roomId, targetUserId: participant.userId })}>
                        Admit
                      </button>
                      <button className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-black text-red-700 transition hover:bg-red-200" onClick={() => socketRef.current?.emit("host:remove", { roomId, targetUserId: participant.userId })}>
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-xl shadow-slate-950/5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-black text-slate-950">Chat</h2>
            </div>
            <div className="grid max-h-72 gap-2 overflow-auto pr-1" ref={chatScrollRef}>
              {messages.map((message) => (
                <article className="rounded-md bg-slate-50 p-3" key={message._id || `${message.senderName}-${message.createdAt}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm text-slate-950">{message.senderName}</strong>
                    <time className="text-xs font-bold text-slate-400">{formatMessageTime(message.createdAt)}</time>
                  </div>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{message.text}</p>
                </article>
              ))}
            </div>
            <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]" onSubmit={sendChatMessage}>
              <input className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-100 disabled:cursor-not-allowed disabled:opacity-60" value={chatText} onChange={(event) => setChatText(event.target.value)} placeholder="Send a message" disabled={!joined} />
              <button className="rounded-md bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={!joined}>Send</button>
            </form>
          </section>
        </aside>
      </section>
    </main>
  );
}
