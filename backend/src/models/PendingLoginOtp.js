import mongoose from "mongoose";

const pendingLoginOtpSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    otpHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

pendingLoginOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PendingLoginOtp = mongoose.model("PendingLoginOtp", pendingLoginOtpSchema);
