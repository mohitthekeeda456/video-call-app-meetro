import mongoose from "mongoose";

const participantSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    name: String,
    email: String,
    role: { type: String, enum: ["host", "cohost", "participant"], default: "participant" },
    joinedAt: Date,
    leftAt: Date,
    admitted: { type: Boolean, default: true }
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    hostName: { type: String, required: true },
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 30 },
    passcode: { type: String, default: "" },
    status: { type: String, enum: ["scheduled", "live", "ended"], default: "scheduled" },
    locked: { type: Boolean, default: false },
    requireApproval: { type: Boolean, default: false },
    participants: [participantSchema],
    events: [{ type: Object }],
    roomId: { type: String, required: true, unique: true }
  },
  { timestamps: true }
);

export const Meeting = mongoose.model("Meeting", meetingSchema);
