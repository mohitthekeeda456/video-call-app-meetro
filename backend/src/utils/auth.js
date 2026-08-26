import jwt from "jsonwebtoken";

export function signAuthToken(user) {
  return jwt.sign({ sub: user._id.toString() }, process.env.JWT_SECRET || "dev-secret", {
    expiresIn: process.env.JWT_EXPIRES_IN || "2h"
  });
}

export function verifyAuthToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
}
