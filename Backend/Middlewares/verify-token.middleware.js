import jwt from "jsonwebtoken";

export function verifyToken(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized access",
    });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({success: false, message: "Please login again",});
  }
}
