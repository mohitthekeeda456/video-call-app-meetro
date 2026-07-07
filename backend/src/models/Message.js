import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: "Meeting", required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    senderName: { type: String, required: true },
    text: { type: String, required: true }
  },
  { timestamps: true }
);

export const Message = mongoose.model("Message", messageSchema);
