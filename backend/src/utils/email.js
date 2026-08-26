import nodemailer from "nodemailer";

function cleanHeaderValue(value) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

export async function sendVerificationOtp({ email, name, otp, purpose = "verification" }) {
  const defaultSender = "meetro.videomeetings.auth@gmail.com";
  const smtpUser = process.env.SMTP_USER || defaultSender;
  const from = process.env.SMTP_FROM || smtpUser;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const hasSmtpConfig = smtpUser && process.env.SMTP_PASS && from;
  const allowSelfSigned =
    process.env.NODE_ENV !== "production" && process.env.SMTP_ALLOW_SELF_SIGNED === "true";

  if (!hasSmtpConfig) {
    if (process.env.NODE_ENV === "production") {
      return { delivered: false, devOnly: false, failed: true };
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV OTP] Meetro ${purpose} for ${email}: ${otp}`);
    }
    return { delivered: false, devOnly: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: smtpUser,
        pass: process.env.SMTP_PASS
      },
      tls: {
        rejectUnauthorized: !allowSelfSigned,
        servername: host
      },
      disableFileAccess: true,
      disableUrlAccess: true
    });

    const safeName = cleanHeaderValue(name);
    await transporter.sendMail({
      from: cleanHeaderValue(from),
      to: email,
      subject: "Your Meetro verification code",
      text: `Hi ${safeName},\n\nYour Meetro code is ${otp}. It expires in 10 minutes.\n\nIf you did not request this, ignore this email.`,
      html: `<p>Hi ${safeName},</p><p>Your Meetro code is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`
    });

    return { delivered: true, devOnly: false };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      console.warn(`Email delivery failed: ${error.message}`);
      return { delivered: false, devOnly: false, failed: true };
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(`[DEV OTP] Meetro ${purpose} for ${email}: ${otp}`);
    }
    console.warn(`Email delivery failed, falling back to console OTP: ${error.message}`);
    return { delivered: false, devOnly: true };
  }
}
