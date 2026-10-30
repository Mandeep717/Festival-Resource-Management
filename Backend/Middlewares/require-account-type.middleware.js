export function requireAccountType(accountType) {
    const allowed = Array.isArray(accountType) ? accountType : [accountType];
    return (req, res, next) => {
        if (!req.user || !allowed.includes(req.user.accountType)) {
            return res.status(403).json({ success: false, message: "This account type is not authorized for this route" });
        }
        return next();
    };
}
