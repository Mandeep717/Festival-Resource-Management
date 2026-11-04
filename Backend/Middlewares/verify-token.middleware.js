import jwt from "jsonwebtoken";
import { UserModel } from "../Models/user.model.js";

export async function verifyToken(req, res, next) {
  if (req.user) return next();
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access",
    });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({success: false, message: "Please login again",});
  }
  const user = await UserModel.findOne({ _id: decoded.userId, status: "active" })
    .select("email accountType status");
  if (!user) {
    return res.status(401).json({
      success: false,
      message: "This account is no longer active",
    });
  }
  req.user = { ...decoded, email: user.email, accountType: user.accountType };
  return next();
}

export async function optionalVerifyToken(req, res, next) {
  const token = req.cookies?.token;
  if (!token || !process.env.JWT_SECRET) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await UserModel.findOne({ _id: decoded.userId, status: "active" })
      .select("email accountType status");
    if (user) req.user = { ...decoded, email: user.email, accountType: user.accountType };
  } catch {
    // Festival information is public, so an expired login must not block it.
  }
  return next();
}
