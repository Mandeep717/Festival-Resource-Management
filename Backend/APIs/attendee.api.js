import exp from 'express';
import { hash, compare } from "bcryptjs";
import jwt from "jsonwebtoken";
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

export const attendeeRouter = exp.Router()

//Register a new attendee
attendeeRouter.post('/register', async(req, res)=>{
    const { email, password, name } = req.body || {}
    if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string" || !email.trim() || !password || !name.trim()) return res.status(400).json({message: "Email, password, and name are required"})
    const hashedPassword = await hash(password, 12);
    let newAttendee = await UserModel.create({email, name, password: hashedPassword, accountType: "attendee"})
    const attendee = newAttendee.toObject()
    delete attendee.password
    res.status(201).json({message: "Attendee registered successfully", attendee})
})

//Login an attendee
attendeeRouter.post('/login', async(req, res)=>{
    let attendeeCred = req.body
    if(typeof attendeeCred.email !== "string" || typeof attendeeCred.password !== "string" || !attendeeCred.email.trim() || !attendeeCred.password) {
        return res.status(400).json({message: "Email and password are required"})
    }
    const user = await UserModel.findOne({ email: attendeeCred.email.trim().toLowerCase() });
    if (!user || user.status !== "active") {
        return res.status(401).json({message: "Invalid credentials"})
    }
    const isMatch = await compare(attendeeCred.password, user.password);
    if (!isMatch) {
        return res.status(401).json({message: "Invalid credentials"})
    }
    const token = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
    );
    res.cookie("token", token, { httpOnly: true });
    res.status(200).json({ message: "Login successful", token });
})

//Logout
attendeeRouter.post('/logout', verifyToken, (req, res)=>{
    res.clearCookie("token");
    res.status(200).json({ message: "Logout successful" });
})

//Get profile of logged-in attendee
attendeeRouter.get('/me', verifyToken, async(req, res)=>{
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
attendeeRouter.put('/change-password', verifyToken, async(req, res)=>{
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let { oldPassword, newPassword } = req.body || {}
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
attendeeRouter.post("/forgot-password", async (req, res) => {
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
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    let existingRegistration = await RegistrationModel.findOne({festivalId, userId: attendeeId, sessionId: { $exists: false }})
    if(existingRegistration){
        return res.status(400).json({message: "You have already registered for this festival"})
    }
    if(festival.status !== "upcoming"){
        return res.status(400).json({message: "Registration is closed for this festival"})
    }
    if(new Date() > festival.registrationDeadline){
        return res.status(400).json({message: "Registration deadline has passed"})
    }
    if (festival.registrationStartDate && new Date() < festival.registrationStartDate) {
        return res.status(400).json({message: "Registration has not opened yet"})
    }
    let newRegistration = await RegistrationModel.create({
        festivalId: festivalId,
        userId: attendeeId
    });
    await FestivalMembershipModel.findOneAndUpdate(
        { festivalId, userId: attendeeId, membershipType: "attendee" },
        { $set: { status: "active" } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    res.status(201).json({message: "Registration successful", registration: newRegistration})
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
    if(!await FestivalModel.exists({_id: festivalId})){
        return res.status(404).json({message: "Festival not found"})
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
    let existingRegistration = await RegistrationModel.findOne({festivalId, sessionId, userId: attendeeId, status: { $ne: "cancelled" }})
    if(existingRegistration){
        return res.status(400).json({message: "You have already registered for this session"})
    }
    if (session.maxParticipants !== null) {
        const activeCount = await RegistrationModel.countDocuments({festivalId, sessionId, status: { $ne: "cancelled"}})
        if (activeCount >= session.maxParticipants) {
            return res.status(409).json({message: "Session is full; join the waitlist"})
        }
    }
    let newRegistration = await RegistrationModel.create({
        festivalId: festivalId,
        sessionId: sessionId,
        userId: attendeeId
    })
    res.status(201).json({message: "Session registration successful", registration: newRegistration})
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
    let registration = await RegistrationModel.findOneAndDelete({festivalId, sessionId, userId: attendeeId})
    if(!registration){
        return res.status(404).json({message: "You are not registered for this session"})
    }
    const nextInLine = await WaitListModel.findOneAndUpdate(
        { festivalId, sessionId, status: "waiting" },
        { $set: { status: "notified", promotedAt: new Date(), registrationId: registration._id } },
        { sort: { position: 1, joinedAt: 1 }, new: true }
    )
    if (nextInLine) {
        const promoted = await RegistrationModel.create({festivalId, sessionId, userId: nextInLine.userId, status: "confirmed"})
        nextInLine.registrationId = promoted._id
        await nextInLine.save()
    }
    res.status(200).json({success: true, message: "Session unregistration successful", promotedWaitlistEntry: nextInLine})
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
    if (session.proposalStatus !== "approved") {
        return res.status(409).json({message: "The session is not available for waitlisting until approved"})
    }
    const membership = await FestivalMembershipModel.findOne({festivalId, userId: attendeeId, membershipType: "attendee", status: "active"})
    if (!membership) return res.status(403).json({message: "Active attendee membership is required"})
    const activeCount = await RegistrationModel.countDocuments({festivalId, sessionId, status: { $ne: "cancelled"}})
    if (session.maxParticipants === null || activeCount < session.maxParticipants) {
        return res.status(400).json({message: "Session still has available capacity"})
    }
    const existingEntry = await WaitListModel.findOne({festivalId, sessionId, userId: attendeeId, status: "waiting"})
    if (existingEntry) return res.status(409).json({message: "You are already on the waiting list"})
    const position = (await WaitListModel.countDocuments({festivalId, sessionId, status: "waiting"})) + 1
    let newWaitlistEntry = await WaitListModel.create({
        festivalId: festivalId,
        sessionId: sessionId,
        userId: attendeeId,
        position
    })
    res.status(201).json({message: "Joined waiting list successfully", waitlistEntry: newWaitlistEntry})
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

