import exp from 'express';
import { hash, compare } from "bcryptjs";
import { Types } from "mongoose";
import crypto from "crypto";
import { verifyToken } from "../Middlewares/verify-token.middleware.js";
import { UserModel } from "../Models/user.model.js";
import { EmailTokenModel } from "../Models/email-token.model.js";
import { FestivalModel } from "../Models/festival.model.js";
import { RegistrationModel } from "../Models/registration.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { allowedRoles } from "../Middlewares/allowed-roles.middleware.js";
import { WaitListModel } from "../Models/wailist.model.js";
import { FestivalMembershipModel } from "../Models/festival-membership.model.js";
import { requireAccountType } from "../Middlewares/require-account-type.middleware.js";
import { apiError, runTransaction, sendTransactionError } from "../Services/transaction.service.js";
import { sessionCookieOptions, signSessionToken } from "../Services/session.service.js";
import { authAttemptLimit } from "../Middlewares/auth-attempt-limit.middleware.js";

export const attendeeRouter = exp.Router()

//Register a new attendee
attendeeRouter.post('/register', authAttemptLimit, async(req, res)=>{
    const { email, password, name } = req.body || {}
    if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string" || !email.trim() || !password || !name.trim()) return res.status(400).json({message: "Email, password, and name are required"})
    if (password.length < 8 || password.length > 72) return res.status(400).json({message: "Password must be between 8 and 72 characters"})
    const hashedPassword = await hash(password, 12);
    let newAttendee = await UserModel.create({email, name, password: hashedPassword, accountType: "attendee"})
    const attendee = newAttendee.toObject()
    delete attendee.password
    res.status(201).json({message: "Attendee registered successfully", attendee})
})

//Login an attendee
attendeeRouter.post('/login', authAttemptLimit, async(req, res)=>{
    let attendeeCred = req.body
    if(typeof attendeeCred.email !== "string" || typeof attendeeCred.password !== "string" || !attendeeCred.email.trim() || !attendeeCred.password) {
        return res.status(400).json({message: "Email and password are required"})
    }
    const user = await UserModel.findOne({ email: attendeeCred.email.trim().toLowerCase(), accountType: "attendee" });
    if (!user || user.status !== "active") {
        return res.status(401).json({message: "Invalid credentials"})
    }
    const isMatch = await compare(attendeeCred.password, user.password);
    if (!isMatch) {
        return res.status(401).json({message: "Invalid credentials"})
    }
    const token = signSessionToken(user);
    res.cookie("token", token, sessionCookieOptions());
    res.status(200).json({ message: "Login successful" });
})

//Logout
attendeeRouter.post('/logout', (req, res)=>{
    res.clearCookie("token", sessionCookieOptions());
    res.status(200).json({ message: "Logout successful" });
})

//Get profile of logged-in attendee
attendeeRouter.get('/me', verifyToken, requireAccountType("attendee"), async(req, res)=>{
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let attendee = await UserModel.findById(attendeeId).select("-password")
    if(!attendee){
        return res.status(404).json({message: "Attendee not found"})
    }
    res.status(200).json({success: true, profile: attendee, message: "Attendee profile retrieved successfully"})
})

//Change password of logged-in attendee
attendeeRouter.put('/change-password', verifyToken, requireAccountType("attendee"), async(req, res)=>{
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let { oldPassword, newPassword } = req.body || {}
    if (typeof oldPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 72) {
        return res.status(400).json({success: false, message: "Old password is required and new password must be between 8 and 72 characters"})
    }
    let attendee = await UserModel.findById(attendeeId)
    if(!attendee){
        return res.status(404).json({message: "Attendee not found"})
    }
    const isMatch = await compare(oldPassword, attendee.password);
    if (!isMatch) {
        return res.status(401).json({message: "Old password is incorrect"})
    }
    const newHashed = await hash(newPassword, 12);
    attendee.password = newHashed
    await attendee.save()
    res.status(200).json({success: true, message: "Password changed successfully"})
})

// Forgot password
attendeeRouter.post("/forgot-password", authAttemptLimit, async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ message: "Email is required" });
    }
    const user = await UserModel.findOne({
        email: email.trim().toLowerCase(),
        accountType: "attendee",
    }).select("_id");
    if (user) {
        const resetToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
        await EmailTokenModel.deleteMany({userId: user._id, tokenType: "PASSWORD_RESET", consumedAt: null});
        await EmailTokenModel.create({
            userId: user._id,
            tokenHash,
            tokenType: "PASSWORD_RESET",
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });
    }
    return res.status(200).json({
        success: true,
        message: "If the email exists, a password reset link will be sent",
    });
});

//List all festivals
attendeeRouter.get("/festivals", async(req, res)=>{
    let festivals = await FestivalModel.find()
    res.status(200).json({success: true, festivals: festivals, message: "Festivals retrieved successfully"})
})

//Get details of a specific festival
attendeeRouter.get("/festivals/:festivalId", async(req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, festival: festival, message: "Festival details retrieved successfully"})
})

attendeeRouter.use(verifyToken, requireAccountType("attendee"));

//Apply for attendee membership in a festival
attendeeRouter.post("/festivals/:festivalId/membership/apply", verifyToken, async (req, res) => {
    const { festivalId } = req.params;
    const attendeeId = req.user.userId;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(attendeeId)) {
        return res.status(400).json({success: false, message: "Invalid attendee ID"});
    }
    const [festival, attendee] = await Promise.all([
        FestivalModel.findById(festivalId),
        UserModel.findById(attendeeId).select("accountType status"),
    ]);
    if (!festival) {
        return res.status(404).json({success: false, message: "Festival not found"});
    }
    if (!attendee) {
        return res.status(404).json({success: false, message: "Attendee not found"});
    }
    if (attendee.accountType !== "attendee" || attendee.status !== "active") {
        return res.status(403).json({success: false, message: "An active attendee account is required"});
    }
    const existingMembership = await FestivalMembershipModel.findOne({
        festivalId,
        userId: attendeeId,
        membershipType: "attendee",
    });
    if (existingMembership?.status === "active") {
        return res.status(200).json({success: true, message: "Attendee membership is already active", membership: existingMembership});
    }
    const membership = existingMembership
        ? await FestivalMembershipModel.findByIdAndUpdate(existingMembership._id, {status: "active"}, {new: true, runValidators: true})
        : await FestivalMembershipModel.create({festivalId, userId: attendeeId, membershipType: "attendee", status: "active"});
    return res.status(existingMembership ? 200 : 201).json({success: true, message: "Attendee membership activated successfully", membership});
});

//Register for a festival
attendeeRouter.post("/festivals/:festivalId/register", verifyToken, async(req, res)=>{
    let {festivalId} = req.params
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    try {
        const registration = await runTransaction(async (dbSession) => {
            const festival = await FestivalModel.findOneAndUpdate(
                { _id: festivalId, status: "upcoming" },
                { $inc: { registrationRevision: 1 } },
                { new: true, session: dbSession }
            );
            if (!festival) {
                const exists = await FestivalModel.exists({_id: festivalId}).session(dbSession);
                throw apiError(exists ? 400 : 404, exists ? "Registration is closed for this festival" : "Festival not found");
            }
            const now = new Date();
            if (now > festival.registrationDeadline) throw apiError(400, "Registration deadline has passed");
            if (now < festival.registrationStartDate) throw apiError(400, "Registration has not opened yet");
            const existing = await RegistrationModel.findOne({
                festivalId, userId: attendeeId, sessionId: { $exists: false },
            }).session(dbSession);
            if (existing) throw apiError(409, "You have already registered for this festival");
            const [created] = await RegistrationModel.create([{festivalId, userId: attendeeId}], {session: dbSession});
            await FestivalMembershipModel.findOneAndUpdate(
                {festivalId, userId: attendeeId, membershipType: "attendee"},
                {$set: {status: "active"}},
                {upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, session: dbSession}
            );
            return created;
        });
        return res.status(201).json({success: true, message: "Registration successful", registration});
    } catch (error) {
        return sendTransactionError(res, error, "Festival registration failed");
    }
})

//Check registration status
attendeeRouter.get("/festivals/:festivalId/registration-status", verifyToken, async(req, res)=>{
    let {festivalId} = req.params
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let registration = await RegistrationModel.findOne({festivalId, userId: attendeeId, sessionId: { $exists: false }})
    if(!registration){
        return res.status(404).json({message: "You have not registered for this festival"})
    }
    res.status(200).json({success: true, registration: registration, message: "Registration status retrieved successfully"})
})

//Get all registrations of logged-in attendee
attendeeRouter.get("/my-registrations", verifyToken, async(req, res)=>{
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let registrations = await RegistrationModel.find({userId: attendeeId}).populate("festivalId")
    res.status(200).json({success: true, registrations: registrations, message: "Your registrations retrieved successfully"})
})

//Register for a session of a specific festival
attendeeRouter.post("/festivals/:festivalId/sessions/:sessionId/register", verifyToken, async (req, res)=>{
    let {festivalId, sessionId} = req.params
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    const festival = await FestivalModel.findById(festivalId).select("status startDate registrationStartDate registrationDeadline")
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    const now = new Date()
    if (festival.status !== "upcoming" || now < festival.registrationStartDate || now > festival.registrationDeadline || now >= festival.startDate) {
        return res.status(400).json({message: "Festival registration is closed"})
    }
    if(!await FestivalSessionModel.exists({_id: sessionId, festivalId: festivalId})){
        return res.status(404).json({message: "Session not found for this festival"})
    }
    const membership = await FestivalMembershipModel.findOne({festivalId, userId: attendeeId, membershipType: "attendee", status: "active"})
    if (!membership) {
        return res.status(403).json({message: "Active attendee membership is required"})
    }
    const session = await FestivalSessionModel.findOne({_id: sessionId, festivalId})
    if (session.proposalStatus !== "approved") {
        return res.status(409).json({message: "Session registration is unavailable until the session is approved"})
    }
    if (session.registrationStartDate && new Date() < session.registrationStartDate) {
        return res.status(400).json({message: "Session registration has not opened yet"})
    }
    if (session.registrationDeadline && new Date() > session.registrationDeadline) {
        return res.status(400).json({message: "Session registration deadline has passed"})
    }
    const festivalRegistration = await RegistrationModel.exists({
        festivalId,
        userId: attendeeId,
        sessionId: {$exists: false}
    })
    if (!festivalRegistration) {
        return res.status(403).json({message: "Register for the festival before registering for a session"})
    }
    try {
        const newRegistration = await runTransaction(async (dbSession) => {
            const lockedSession = await FestivalSessionModel.findOneAndUpdate(
                { _id: sessionId, festivalId, proposalStatus: "approved" },
                { $inc: { registrationRevision: 1 } },
                { new: true, session: dbSession }
            );
            if (!lockedSession) throw apiError(409, "Session registration is unavailable");
            const now = new Date();
            if (lockedSession.registrationStartDate && now < lockedSession.registrationStartDate) {
                throw apiError(400, "Session registration has not opened yet");
            }
            if (lockedSession.registrationDeadline && now > lockedSession.registrationDeadline) {
                throw apiError(400, "Session registration deadline has passed");
            }
            const existingRegistration = await RegistrationModel.findOne({
                festivalId, sessionId, userId: attendeeId, status: { $ne: "cancelled" },
            }).session(dbSession);
            if (existingRegistration) throw apiError(409, "You have already registered for this session");
            if (lockedSession.maxParticipants !== null) {
                const activeCount = await RegistrationModel.countDocuments({
                    festivalId, sessionId, status: { $ne: "cancelled" },
                }).session(dbSession);
                if (activeCount >= lockedSession.maxParticipants) throw apiError(409, "Session is full; join the waitlist");
            }
            const [created] = await RegistrationModel.create([{
                festivalId, sessionId, userId: attendeeId,
            }], { session: dbSession });
            return created;
        });
        return res.status(201).json({success: true, message: "Session registration successful", registration: newRegistration});
    } catch (error) {
        return sendTransactionError(res, error, "Session registration failed");
    }
})

//Delete a session registration
attendeeRouter.delete("/festivals/:festivalId/sessions/:sessionId/unregister", verifyToken, async (req, res)=>{
    let {festivalId, sessionId} = req.params
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    try {
        const result = await runTransaction(async (dbSession) => {
            const lockedSession = await FestivalSessionModel.findOneAndUpdate(
                { _id: sessionId, festivalId },
                { $inc: { registrationRevision: 1 } },
                { new: true, session: dbSession }
            );
            if (!lockedSession) throw apiError(404, "Session not found for this festival");
            const registration = await RegistrationModel.findOneAndDelete(
                { festivalId, sessionId, userId: attendeeId },
                { session: dbSession }
            );
            if (!registration) throw apiError(404, "You are not registered for this session");

            let promotedEntry = null;
            while (true) {
                const candidate = await WaitListModel.findOneAndUpdate(
                    { festivalId, sessionId, status: "waiting" },
                    { $set: { status: "notified", promotedAt: new Date(), registrationId: null } },
                    { sort: { position: 1, joinedAt: 1 }, new: true, session: dbSession }
                );
                if (!candidate) break;
                const existing = await RegistrationModel.exists({
                    festivalId, sessionId, userId: candidate.userId, status: { $ne: "cancelled" },
                }).session(dbSession);
                if (existing) {
                    candidate.status = "removed";
                    candidate.cancelledAt = new Date();
                    await candidate.save({ session: dbSession });
                    continue;
                }
                const [promoted] = await RegistrationModel.create([{
                    festivalId, sessionId, userId: candidate.userId, status: "confirmed",
                }], { session: dbSession });
                candidate.registrationId = promoted._id;
                await candidate.save({ session: dbSession });
                promotedEntry = candidate;
                break;
            }
            return { registration, promotedEntry };
        });
        return res.status(200).json({success: true, message: "Session unregistration successful", promotedWaitlistEntry: result.promotedEntry});
    } catch (error) {
        return sendTransactionError(res, error, "Session unregistration failed");
    }
})

//Join waiting list for a session of a specific festival
attendeeRouter.post("/festivals/:festivalId/sessions/:sessionId/waitlist", verifyToken, async (req, res)=>{
    let {festivalId, sessionId} = req.params
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    const session = await FestivalSessionModel.findOne({_id: sessionId, festivalId})
    if (!session) return res.status(404).json({message: "Session not found for this festival"})
    if (session.proposalStatus !== "approved") return res.status(409).json({message: "The session is not available for waitlisting until approved"})
    const festival = await FestivalModel.findById(festivalId).select("status startDate registrationStartDate registrationDeadline")
    if (!festival) return res.status(404).json({message: "Festival not found"})
    const now = new Date()
    if (festival.status !== "upcoming" || now < festival.registrationStartDate || now > festival.registrationDeadline || now >= festival.startDate) {
        return res.status(400).json({message: "Festival registration is closed"})
    }
    const membership = await FestivalMembershipModel.findOne({festivalId, userId: attendeeId, membershipType: "attendee", status: "active"})
    if (!membership) return res.status(403).json({message: "Active attendee membership is required"})
    try {
        const newWaitlistEntry = await runTransaction(async (dbSession) => {
            const lockedSession = await FestivalSessionModel.findOneAndUpdate(
                { _id: sessionId, festivalId, proposalStatus: "approved" },
                { $inc: { registrationRevision: 1 } },
                { new: true, session: dbSession }
            );
            if (!lockedSession) throw apiError(409, "The session is not available for waitlisting");
            const existingRegistration = await RegistrationModel.exists({
                festivalId, sessionId, userId: attendeeId, status: { $ne: "cancelled" },
            }).session(dbSession);
            if (existingRegistration) throw apiError(409, "You are already registered for this session");
            const existingEntry = await WaitListModel.findOne({
                festivalId, sessionId, userId: attendeeId, status: "waiting",
            }).session(dbSession);
            if (existingEntry) throw apiError(409, "You are already on the waiting list");
            const transactionNow = new Date();
            if (lockedSession.registrationStartDate && transactionNow < lockedSession.registrationStartDate) {
                throw apiError(400, "Session registration has not opened yet");
            }
            if (lockedSession.registrationDeadline && transactionNow > lockedSession.registrationDeadline) {
                throw apiError(400, "Session registration deadline has passed");
            }
            const activeCount = await RegistrationModel.countDocuments({
                festivalId, sessionId, status: { $ne: "cancelled" },
            }).session(dbSession);
            if (lockedSession.maxParticipants === null || activeCount < lockedSession.maxParticipants) {
                throw apiError(400, "Session still has available capacity");
            }
            const lastEntry = await WaitListModel.findOne({
                festivalId, sessionId, status: "waiting",
            }).sort({ position: -1, joinedAt: -1 }).select("position").session(dbSession);
            const position = (lastEntry?.position || 0) + 1;
            const [created] = await WaitListModel.create([{
                festivalId, sessionId, userId: attendeeId, position,
            }], { session: dbSession });
            return created;
        });
        return res.status(201).json({success: true, message: "Joined waiting list successfully", waitlistEntry: newWaitlistEntry});
    } catch (error) {
        return sendTransactionError(res, error, "Joining the waitlist failed");
    }
})

//Check wait list status for a session of a specific festival
attendeeRouter.get("/festivals/:festivalId/sessions/:sessionId/waitlist-status", verifyToken, async (req, res)=>{
    let {festivalId, sessionId} = req.params
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let waitlistEntry = await WaitListModel.findOne({festivalId, sessionId, userId: attendeeId})
    if(!waitlistEntry){
        return res.status(404).json({message: "You are not on the waiting list for this session"})
    }
    res.status(200).json({success: true, waitlistEntry: waitlistEntry, waitlistStatus: waitlistEntry.status, waitlistPosition: waitlistEntry.position, message: "Waiting list status retrieved successfully"})
})

//Leave session waitlist
attendeeRouter.delete("/festivals/:festivalId/sessions/:sessionId/waitlist", verifyToken, async (req, res)=>{
    let {festivalId, sessionId} = req.params
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let waitlistEntry = await WaitListModel.findOneAndDelete({festivalId, sessionId, userId: attendeeId, status: "waiting"})
    if(!waitlistEntry){
        return res.status(404).json({message: "You are not on the waiting list for this session"})
    }
    res.status(200).json({success: true, message: "Left waiting list successfully"})
})

