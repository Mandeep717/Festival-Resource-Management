const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const attempts = new Map();

export function authAttemptLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || "unknown";
  let record = attempts.get(key);
  if (!record || now >= record.resetAt) record = { count: 0, resetAt: now + WINDOW_MS };

  if (record.count >= MAX_ATTEMPTS) {
    res.setHeader("Retry-After", Math.ceil((record.resetAt - now) / 1000));
    return res.status(429).json({ success: false, message: "Too many authentication attempts. Please try again later." });
  }

  record.count += 1;
  attempts.set(key, record);
  if (attempts.size > 10_000) {
    for (const [address, entry] of attempts) if (now >= entry.resetAt) attempts.delete(address);
  }
  return next();
}
