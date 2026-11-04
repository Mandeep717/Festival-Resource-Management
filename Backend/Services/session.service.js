import jwt from "jsonwebtoken";

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
}

export function signSessionToken(user) {
  if (!process.env.JWT_SECRET) {
    const error = new Error("JWT_SECRET must be configured");
    error.statusCode = 500;
    throw error;
  }
  return jwt.sign(
    { userId: String(user._id), email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "1h" },
  );
}
