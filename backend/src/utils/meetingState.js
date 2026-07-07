export function isHostLike(participant) {
  return participant?.role === "host" || participant?.role === "cohost";
}

export function appendMeetingEvent(meeting, event) {
  meeting.events.push({
    createdAt: new Date(),
    metadata: {},
    ...event
  });
}

export function findParticipantIndex(collection, userId) {
  return collection.findIndex((participant) => participant.userId?.toString() === userId.toString());
}

export function ensureParticipant(collection, participantInput) {
  const index = findParticipantIndex(collection, participantInput.userId);
  const nextParticipant = {
    admitted: true,
    micMuted: false,
    cameraOff: false,
    isSharingScreen: false,
    ...participantInput
  };

  if (index >= 0) {
    collection[index] = {
      ...collection[index].toObject?.(),
      ...nextParticipant
    };
    return collection[index];
  }

  collection.push(nextParticipant);
  return collection[collection.length - 1];
}

export function removeParticipant(collection, userId) {
  const index = findParticipantIndex(collection, userId);
  if (index >= 0) {
    collection.splice(index, 1);
  }
}

export function chooseNextHost(meeting, activeParticipants = []) {
  const activeUserIds = new Set(activeParticipants.map((participant) => participant.userId?.toString()));
  const admittedParticipants = meeting.participants.filter(
    (participant) => participant.admitted && !participant.leftAt && participant.userId?.toString() !== meeting.hostId.toString()
  );

  const preferredPool = admittedParticipants.filter((participant) => activeUserIds.has(participant.userId?.toString()));
  const rankedPool = preferredPool.length > 0 ? preferredPool : admittedParticipants;

  return (
    rankedPool.find((participant) => participant.role === "cohost") ||
    rankedPool.find((participant) => participant.role === "participant") ||
    null
  );
}

export function serializeMeeting(meeting, viewerId, activeParticipants = []) {
  const viewerIdString = viewerId?.toString?.() || "";
  const activeByUserId = new Map(activeParticipants.map((participant) => [participant.userId, participant]));
  const viewerParticipant = meeting.participants.find((participant) => participant.userId?.toString() === viewerIdString);
  const canModerate = isHostLike(viewerParticipant) || meeting.hostId.toString() === viewerIdString;

  return {
    id: meeting._id.toString(),
    roomId: meeting.roomId,
    title: meeting.title,
    description: meeting.description,
    hostId: meeting.hostId.toString(),
    hostName: meeting.hostName,
    scheduledAt: meeting.scheduledAt,
    durationMinutes: meeting.durationMinutes,
    status: meeting.status,
    locked: meeting.locked,
    requireApproval: meeting.requireApproval,
    hasPasscode: Boolean(meeting.passcode),
    participants: meeting.participants.map((participant) => {
      const active = activeByUserId.get(participant.userId?.toString());
      return {
        userId: participant.userId?.toString(),
        name: participant.name,
        email: participant.email,
        role: participant.role,
        joinedAt: participant.joinedAt,
        leftAt: participant.leftAt,
        admitted: participant.admitted,
        micMuted: active?.micMuted ?? participant.micMuted ?? false,
        cameraOff: active?.cameraOff ?? participant.cameraOff ?? false,
        isSharingScreen: active?.isSharingScreen ?? participant.isSharingScreen ?? false,
        isActive: active?.isActive ?? false
      };
    }),
    pendingParticipants: canModerate
      ? meeting.pendingParticipants.map((participant) => ({
          userId: participant.userId?.toString(),
          name: participant.name,
          email: participant.email,
          requestedAt: participant.joinedAt,
          role: participant.role
        }))
      : [],
    selfRole: viewerParticipant?.role || (meeting.hostId.toString() === viewerIdString ? "host" : "participant"),
    canModerate
  };
}
