import exp from "express";
import { compare, hash } from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import { UserModel } from "../Models/user.model.js";
import { FestivalModel } from "../Models/festival.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { RegistrationModel } from "../Models/registration.model.js";
import { VenueModel } from "../Models/venue.model.js";
import { ResourceModel } from "../Models/resource.model.js";
import { ShiftModel } from "../Models/shift.model.js";
import { IncidentModel } from "../Models/incident.model.js";
import { FestivalMembershipModel } from "../Models/festival-membership.model.js";
import { sessionCookieOptions, signSessionToken } from "../Services/session.service.js";
import { authAttemptLimit } from "../Middlewares/auth-attempt-limit.middleware.js";

export const adminRouter = exp.Router();

const USER_TYPES = ["attendee", "organizer", "volunteer", "admin"];
const EDITABLE_USER_TYPES = ["attendee", "organizer", "volunteer"];
const USER_STATUSES = ["active", "disabled", "pending"];
const VENUE_STATUSES = ["active", "inactive", "under_maintenance"];
const RESOURCE_STATUSES = ["available", "unavailable", "reserved"];
const FESTIVAL_STATUSES = ["upcoming", "ongoing", "completed", "cancelled"];
const SESSION_STATUSES = ["scheduled", "ongoing", "completed", "cancelled"];
const SHIFT_STATUSES = ["scheduled", "ongoing", "completed", "cancelled"];
const INCIDENT_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

function safeUser(user) {
    if (!user) return user;
    const value = user.toObject ? user.toObject() : user;
    delete value.password;
    return value;
}

function validId(id) {
    return Types.ObjectId.isValid(id);
}

function badRequest(res, message) {
    return res.status(400).json({ success: false, message });
}

function getPage(query) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 25));
    return { page, limit, skip: (page - 1) * limit };
}

function pick(source, fields) {
    const result = {};
    for (const field of fields) {
        if (Object.hasOwn(source, field)) result[field] = source[field];
    }
    return result;
}

function validateRequiredStrings(body, fields) {
    return fields.every((field) => typeof body[field] === "string" && body[field].trim());
}

// Admin accounts are created out of band in MongoDB. There is intentionally no
// admin registration route; every protected request rechecks the user's role.
async function verifyAdmin(req, res, next) {
    const token = req.cookies?.token;
    if (!token) {
        return res.status(401).json({ success: false, message: "Admin authentication required" });
    }
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ success: false, message: "Authentication is not configured" });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!validId(decoded.userId)) {
            return res.status(401).json({ success: false, message: "Please login again" });
        }
        const admin = await UserModel.findOne({
            _id: decoded.userId,
            accountType: "admin",
            status: "active",
        }).select("-password");
        if (!admin) {
            return res.status(403).json({ success: false, message: "Active admin access is required" });
        }
        req.user = { userId: String(admin._id), email: admin.email };
        req.admin = admin;
        return next();
    } catch {
        return res.status(401).json({ success: false, message: "Please login again" });
    }
}

adminRouter.post("/login", authAttemptLimit, async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return badRequest(res, "Email and password are required");
    if (!process.env.JWT_SECRET) {
        return res.status(500).json({ success: false, message: "Authentication is not configured" });
    }

    const admin = await UserModel.findOne({ email, accountType: "admin", status: "active" });
    if (!admin || !(await compare(password, admin.password))) {
        return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    admin.lastLogIn = new Date();
    await admin.save();
    const token = signSessionToken(admin);
    res.cookie("token", token, sessionCookieOptions());
    return res.status(200).json({ success: true, message: "Admin login successful", admin: safeUser(admin) });
});

adminRouter.post("/logout", (req, res) => {
    res.clearCookie("token", sessionCookieOptions());
    return res.status(200).json({ success: true, message: "Admin logout successful" });
});

adminRouter.get("/me", verifyAdmin, (req, res) => {
    return res.status(200).json({ success: true, admin: safeUser(req.admin) });
});

adminRouter.get("/dashboard", verifyAdmin, async (req, res) => {
    const [users, festivals, sessions, registrations, venues, resources, shifts, incidents] = await Promise.all([
        UserModel.countDocuments(),
        FestivalModel.countDocuments(),
        FestivalSessionModel.countDocuments(),
        RegistrationModel.countDocuments({ status: { $ne: "cancelled" } }),
        VenueModel.countDocuments(),
        ResourceModel.countDocuments(),
        ShiftModel.countDocuments(),
        IncidentModel.countDocuments(),
    ]);
    return res.status(200).json({
        success: true,
        dashboard: { users, festivals, sessions, registrations, venues, resources, shifts, incidents },
    });
});

adminRouter.get("/memberships", verifyAdmin, async (req, res) => {
    const { page, limit, skip } = getPage(req.query);
    const filter = {};
    if (["attendee", "volunteer", "organizer"].includes(req.query.membershipType)) filter.membershipType = req.query.membershipType;
    if (["active", "inactive", "pending"].includes(req.query.status)) filter.status = req.query.status;
    if (validId(req.query.festivalId)) filter.festivalId = req.query.festivalId;
    const [memberships, total] = await Promise.all([
        FestivalMembershipModel.find(filter)
            .populate("userId", "name email accountType status")
            .populate("festivalId", "name slug")
            .sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        FestivalMembershipModel.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, memberships, pagination: { page, limit, total } });
});

adminRouter.patch("/memberships/:id/status", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid membership ID");
    const { status } = req.body || {};
    if (!["active", "inactive", "pending"].includes(status)) return badRequest(res, "Membership status must be active, inactive, or pending");
    const existing = await FestivalMembershipModel.findById(req.params.id).select("userId festivalId membershipType");
    if (!existing) return res.status(404).json({ success: false, message: "Membership not found" });
    if (status === "active") {
        const [userExists, festivalExists] = await Promise.all([
            UserModel.exists({ _id: existing.userId, accountType: existing.membershipType, status: "active" }),
            FestivalModel.exists({ _id: existing.festivalId }),
        ]);
        if (!userExists) return res.status(409).json({ success: false, message: "Only an active user with the matching account type can receive this membership" });
        if (!festivalExists) return res.status(409).json({ success: false, message: "Membership festival no longer exists" });
    }
    const membership = await FestivalMembershipModel.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true, runValidators: true }
    ).populate("userId", "name email accountType status").populate("festivalId", "name slug");
    if (!membership) return res.status(404).json({ success: false, message: "Membership not found" });
    return res.status(200).json({ success: true, membership, message: "Membership status updated" });
});

// Paginated user list and user detail. Password hashes are never returned.
adminRouter.get("/users", verifyAdmin, async (req, res) => {
    const { page, limit, skip } = getPage(req.query);
    const filter = {};
    if (USER_TYPES.includes(req.query.accountType)) filter.accountType = req.query.accountType;
    if (USER_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const [users, total] = await Promise.all([
        UserModel.find(filter).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        UserModel.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, users, pagination: { page, limit, total } });
});

adminRouter.get("/users/:id", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid user ID");
    const user = await UserModel.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, user: safeUser(user) });
});

adminRouter.patch("/users/:id", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid user ID");
    const updates = pick(req.body || {}, ["name", "email", "accountType", "status"]);
    if (!Object.keys(updates).length) return badRequest(res, "Provide at least one supported user field to update");
    if (Object.hasOwn(updates, "name")) {
        if (typeof updates.name !== "string" || !updates.name.trim()) return badRequest(res, "Name must be a non-empty string");
        updates.name = updates.name.trim();
    }
    if (Object.hasOwn(updates, "email")) {
        if (typeof updates.email !== "string" || !updates.email.trim()) return badRequest(res, "Email must be a non-empty string");
        updates.email = updates.email.trim().toLowerCase();
    }
    if (Object.hasOwn(updates, "accountType") && !EDITABLE_USER_TYPES.includes(updates.accountType)) return badRequest(res, "Invalid account type; admin accounts are provisioned directly in the database");
    if (Object.hasOwn(updates, "status") && !USER_STATUSES.includes(updates.status)) return badRequest(res, "Invalid user status");
    if (String(req.admin._id) === req.params.id && (updates.status === "disabled" || (updates.accountType && updates.accountType !== "admin"))) {
        return res.status(409).json({ success: false, message: "You cannot disable or demote your own admin account" });
    }
    const user = await UserModel.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, user: safeUser(user) });
});

adminRouter.patch("/users/:id/status", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid user ID");
    const { status } = req.body || {};
    if (!USER_STATUSES.includes(status)) return badRequest(res, "Status must be active, disabled, or pending");
    if (String(req.admin._id) === req.params.id && status !== "active") {
        return res.status(409).json({ success: false, message: "You cannot disable or suspend your own admin account" });
    }
    const user = await UserModel.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.status(200).json({ success: true, user: safeUser(user) });
});

adminRouter.put("/users/:id/password", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid user ID");
    const { password } = req.body || {};
    if (typeof password !== "string" || password.length < 8 || password.length > 72) return badRequest(res, "Password must be between 8 and 72 characters");
    const user = await UserModel.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    user.password = await hash(password, 12);
    await user.save();
    return res.status(200).json({ success: true, message: "User password updated successfully" });
});

// Venue administration
adminRouter.get("/venues", verifyAdmin, async (req, res) => {
    const { page, limit, skip } = getPage(req.query);
    const filter = {};
    if (validId(req.query.festivalId)) filter.festivalId = req.query.festivalId;
    if (VENUE_STATUSES.includes(req.query.status)) filter.status = req.query.status;
    const [venues, total] = await Promise.all([
        VenueModel.find(filter).populate("festivalId", "name slug").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        VenueModel.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, venues, pagination: { page, limit, total } });
});

adminRouter.get("/venues/:id", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid venue ID");
    const venue = await VenueModel.findById(req.params.id).populate("festivalId", "name slug");
    if (!venue) return res.status(404).json({ success: false, message: "Venue not found" });
    return res.status(200).json({ success: true, venue });
});

adminRouter.post("/venues", verifyAdmin, async (req, res) => {
    const data = pick(req.body || {}, ["name", "address", "capacity", "description", "festivalId", "venueCode", "status"]);
    if (!validateRequiredStrings(data, ["name", "address", "description", "venueCode"])) return badRequest(res, "Name, address, description, and venueCode are required");
    if (!validId(data.festivalId)) return badRequest(res, "A valid festivalId is required");
    if (!await FestivalModel.exists({ _id: data.festivalId })) return res.status(404).json({ success: false, message: "Festival not found" });
    data.name = data.name.trim(); data.address = data.address.trim(); data.description = data.description.trim(); data.venueCode = data.venueCode.trim();
    const venue = await VenueModel.create(data);
    return res.status(201).json({ success: true, venue, message: "Venue created successfully" });
});

adminRouter.patch("/venues/:id", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid venue ID");
    const updates = pick(req.body || {}, ["name", "address", "capacity", "description", "venueCode", "status"]);
    if (!Object.keys(updates).length) return badRequest(res, "Provide at least one supported venue field to update");
    for (const field of ["name", "address", "description", "venueCode"]) {
        if (Object.hasOwn(updates, field)) {
            if (typeof updates[field] !== "string" || !updates[field].trim()) return badRequest(res, `${field} must be a non-empty string`);
            updates[field] = updates[field].trim();
        }
    }
    if (Object.hasOwn(updates, "status") && !VENUE_STATUSES.includes(updates.status)) return badRequest(res, "Invalid venue status");
    const venue = await VenueModel.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!venue) return res.status(404).json({ success: false, message: "Venue not found" });
    return res.status(200).json({ success: true, venue });
});

adminRouter.patch("/venues/:id/status", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid venue ID");
    const { status } = req.body || {};
    if (!VENUE_STATUSES.includes(status)) return badRequest(res, "Invalid venue status");
    const venue = await VenueModel.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true });
    if (!venue) return res.status(404).json({ success: false, message: "Venue not found" });
    return res.status(200).json({ success: true, venue });
});

// Resource administration
adminRouter.get("/resources", verifyAdmin, async (req, res) => {
    const { page, limit, skip } = getPage(req.query);
    const filter = {};
    if (validId(req.query.festivalId)) filter.festivalId = req.query.festivalId;
    if (RESOURCE_STATUSES.includes(req.query.availabilityStatus)) filter.availabilityStatus = req.query.availabilityStatus;
    const [resources, total] = await Promise.all([
        ResourceModel.find(filter).populate("festivalId", "name slug").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        ResourceModel.countDocuments(filter),
    ]);
    return res.status(200).json({ success: true, resources, pagination: { page, limit, total } });
});

adminRouter.get("/resources/:id", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid resource ID");
    const resource = await ResourceModel.findById(req.params.id).populate("festivalId", "name slug");
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    return res.status(200).json({ success: true, resource });
});

adminRouter.post("/resources", verifyAdmin, async (req, res) => {
    const data = pick(req.body || {}, ["name", "description", "resourceType", "festivalId", "quantity", "availabilityStatus"]);
    if (!validateRequiredStrings(data, ["name", "description", "resourceType"])) return badRequest(res, "Name, description, and resourceType are required");
    if (!validId(data.festivalId)) return badRequest(res, "A valid festivalId is required");
    if (!await FestivalModel.exists({ _id: data.festivalId })) return res.status(404).json({ success: false, message: "Festival not found" });
    data.name = data.name.trim(); data.description = data.description.trim();
    const resource = await ResourceModel.create(data);
    return res.status(201).json({ success: true, resource, message: "Resource created successfully" });
});

adminRouter.patch("/resources/:id", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid resource ID");
    const updates = pick(req.body || {}, ["name", "description", "resourceType", "quantity", "availabilityStatus"]);
    if (!Object.keys(updates).length) return badRequest(res, "Provide at least one supported resource field to update");
    for (const field of ["name", "description", "resourceType"]) {
        if (Object.hasOwn(updates, field)) {
            if (typeof updates[field] !== "string" || !updates[field].trim()) return badRequest(res, `${field} must be a non-empty string`);
            updates[field] = updates[field].trim();
        }
    }
    if (Object.hasOwn(updates, "availabilityStatus") && !RESOURCE_STATUSES.includes(updates.availabilityStatus)) return badRequest(res, "Invalid resource availability status");
    const resource = await ResourceModel.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    return res.status(200).json({ success: true, resource });
});

adminRouter.patch("/resources/:id/status", verifyAdmin, async (req, res) => {
    if (!validId(req.params.id)) return badRequest(res, "Invalid resource ID");
    const { availabilityStatus } = req.body || {};
    if (!RESOURCE_STATUSES.includes(availabilityStatus)) return badRequest(res, "Invalid resource availability status");
    const resource = await ResourceModel.findByIdAndUpdate(req.params.id, { availabilityStatus }, { new: true, runValidators: true });
    if (!resource) return res.status(404).json({ success: false, message: "Resource not found" });
    return res.status(200).json({ success: true, resource });
});

// Global operational status controls for records administered elsewhere.
async function changeStatus({ req, res, model, field, allowed, label, valueName = "status" }) {
    if (!validId(req.params.id)) return badRequest(res, `Invalid ${label} ID`);
    const value = req.body?.[valueName];
    if (!allowed.includes(value)) return badRequest(res, `Invalid ${label} ${valueName}`);
    const record = await model.findByIdAndUpdate(req.params.id, { [field]: value }, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ success: false, message: `${label} not found` });
    return res.status(200).json({ success: true, [label]: record });
}

adminRouter.patch("/festivals/:id/status", verifyAdmin, (req, res) => changeStatus({ req, res, model: FestivalModel, field: "status", allowed: FESTIVAL_STATUSES, label: "festival" }));
adminRouter.patch("/sessions/:id/status", verifyAdmin, (req, res) => changeStatus({ req, res, model: FestivalSessionModel, field: "status", allowed: SESSION_STATUSES, label: "session" }));
adminRouter.patch("/shifts/:id/status", verifyAdmin, (req, res) => changeStatus({ req, res, model: ShiftModel, field: "status", allowed: SHIFT_STATUSES, label: "shift" }));
adminRouter.patch("/incidents/:id/status", verifyAdmin, (req, res) => changeStatus({ req, res, model: IncidentModel, field: "status", allowed: INCIDENT_STATUSES, label: "incident" }));
