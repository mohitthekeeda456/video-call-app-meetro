import jwt from "jsonwebtoken";

export function signAuthToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET || "dev-secret", { expiresIn: "7d" });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
}
