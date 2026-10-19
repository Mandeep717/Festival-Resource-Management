import exp from 'express';
import multer from "multer";
import { hash, compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import crypto from "crypto";
import { verifyToken } from "../Middlewares/verify-token.middleware.js";
import { UserModel } from "../Models/user.model.js";
import { EmailTokenModel } from "../Models/email-token.model.js";
import { allowedRoles } from "../Middlewares/allowed-roles.middleware.js";
import {FestivalModel} from "../Models/festival.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { VenueModel } from "../Models/venue.model.js";
import { ResourceModel } from "../Models/resource.model.js";
import { FestivalSessionModel} from "../Models/festival-sessions.model.js";
import { FestivalMembershipModel } from "../Models/festival-membership.model.js";
import { RegistrationModel } from "../Models/registration.model.js";
import { ShiftModel } from "../Models/shift.model.js";
import { DocumentModel } from "../Models/document.model.js";
import { ChunkModel } from "../Models/chunk.model.js";
import { conflictIdentity } from "../Services/conflict.service.js";
import { validateScheduleVersion } from '../Services/validation.service.js';
import { extractTextFromPDF } from "../Services/read-clean-text.service.js";
import { splitArticleIntoChunks } from "../Services/chunk.service.js";
import { generateChunkEmbeddings } from "../Services/generate-embeddings.service.js";
import { generateAnswer, generateAnswerWithHistory, generateStandaloneQuery } from "../Services/llm.service.js";

export const organizerRouter = exp.Router()

const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

//Register a new organizer
organizerRouter.post('/register', async(req, res)=>{
    const { email, password, name } = req.body || {}
    if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string" || !email.trim() || !password || !name.trim()) return res.status(400).json({message: "Email, password, and name are required"})
    const hashedPassword = await hash(password, 12);
    let newOrganizer = await UserModel.create({email, name, password: hashedPassword, accountType: "organizer"})
    const organizer = newOrganizer.toObject()
    delete organizer.password
    res.status(201).json({message: "Organizer account created; festival access requires an active organizer membership" , organizer})
})
//Login an organizer
organizerRouter.post('/login', async(req, res)=>{
    let organizerCred = req.body
    if(typeof organizerCred.email !== "string" || typeof organizerCred.password !== "string" || !organizerCred.email.trim() || !organizerCred.password) {
        return res.status(400).json({message: "Email and password are required"})
    }
    const user = await UserModel.findOne({ email: organizerCred.email.trim().toLowerCase() });
    if (!user || user.status !== "active") {
        return res.status(401).json({message: "Invalid credentials"})
    }
    const isMatch = await compare(organizerCred.password, user.password);
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
organizerRouter.post('/logout', verifyToken, (req, res)=>{
    res.clearCookie("token");
    res.status(200).json({ message: "Logout successful" });
})

//Get profile of logged-in organizer
organizerRouter.get('/me', verifyToken, async(req, res)=>{
    let organizerId = req.user.userId
    if(!Types.ObjectId.isValid(organizerId)){
        return res.status(400).json({message: "Invalid organizer ID"})
    }
    let organizer = await UserModel.findById(organizerId).select("-password")
    if(!organizer){
        return res.status(404).json({message: "Organizer not found"})
    }
    res.status(200).json({success: true, profile: organizer, message: "Organizer profile retrieved successfully"})
})

//Change password for logged-in organizer
organizerRouter.put('/change-password', verifyToken, async(req, res)=>{
    let organizerId = req.user.userId
    if(!Types.ObjectId.isValid(organizerId)){
        return res.status(400).json({message: "Invalid organizer ID"})
    }
    let { oldPassword, newPassword } = req.body || {}
    let organizer = await UserModel.findById(organizerId)
    if(!organizer){
        return res.status(404).json({message: "Organizer not found"})
    }
    const isMatch = await compare(oldPassword, organizer.password);
    if (!isMatch) {
        return res.status(401).json({message: "Old password is incorrect"})
    }
    const newHashed = await hash(newPassword, 12);
    organizer.password = newHashed
    await organizer.save()
    res.status(200).json({success: true, message: "Password changed successfully"})
})

//Forgot password for organizer
organizerRouter.post("/forgot-password", async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ message: "Email is required" });
    }
    const user = await UserModel.findOne({
        email: email.trim().toLowerCase(),
        accountType: "organizer",
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

//Create a new festival
organizerRouter.post('/festivals', verifyToken, async(req, res)=>{
    let organizerId = req.user.userId
    if(!Types.ObjectId.isValid(organizerId)){
        return res.status(400).json({message: "Invalid organizer ID"})
    }
    let organizer = await UserModel.findById(organizerId)
    if(!organizer){
        return res.status(404).json({message: "Organizer not found"})
    }
    const hasOrganizerMembership = await FestivalMembershipModel.exists({
        userId: organizerId,
        membershipType: "organizer",
        status: "active"
    })
    if (organizer.accountType !== "organizer" || !hasOrganizerMembership) {
        return res.status(403).json({message: "An organizer account with an active organizer membership is required to create a festival"})
    }
    const { name, slug, description, startDate, endDate, location,
        registrationDeadline, registrationFee, registrationStartDate, status } = req.body || {}
    let newFestival = await FestivalModel.create({
        name, slug, description, startDate, endDate, location,
        registrationDeadline, registrationFee, registrationStartDate,
        status, organizerId
    })
    await FestivalMembershipModel.findOneAndUpdate(
        { festivalId: newFestival._id, userId: organizerId, membershipType: "organizer" },
        { $set: { status: "active" } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    res.status(201).json({message: "Festival created successfully", festival: newFestival})
})

//Apply for organizer membership in a festival
organizerRouter.post("/festivals/:festivalId/membership/apply", verifyToken, async (req, res) => {
    const { festivalId } = req.params;
    const organizerId = req.user.userId;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(organizerId)) {
        return res.status(400).json({success: false, message: "Invalid organizer ID"});
    }
    const [festival, organizer] = await Promise.all([
        FestivalModel.findById(festivalId),
        UserModel.findById(organizerId).select("accountType status"),
    ]);
    if (!festival) {
        return res.status(404).json({success: false, message: "Festival not found"});
    }
    if (!organizer) {
        return res.status(404).json({success: false, message: "Organizer not found"});
    }
    if (organizer.accountType !== "organizer" || organizer.status !== "active") {
        return res.status(403).json({success: false, message: "An active organizer account is required"});
    }
    const existingMembership = await FestivalMembershipModel.findOne({
        festivalId,
        userId: organizerId,
        membershipType: "organizer",
    });
    if (existingMembership?.status === "active") {
        return res.status(200).json({success: true, message: "Organizer membership is already active", membership: existingMembership});
    }
    const membership = existingMembership
        ? await FestivalMembershipModel.findByIdAndUpdate(existingMembership._id, {status: "active"}, {new: true, runValidators: true})
        : await FestivalMembershipModel.create({festivalId, userId: organizerId, membershipType: "organizer", status: "active"});
    return res.status(existingMembership ? 200 : 201).json({success: true, message: "Organizer membership activated successfully", membership});
});

//Get all festivals
organizerRouter.get("/festivals", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    const festivalIds = await FestivalMembershipModel.distinct("festivalId", {
        userId: req.user.userId,
        membershipType: "organizer",
        status: "active"
    })
    let festivalsInDb = await FestivalModel.find({_id: {$in: festivalIds}})
    res.status(200).json({success: true, festivals: festivalsInDb})
})

//Get specific festival by festivalId
organizerRouter.get("/festival/:festivalId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, festival: festival})
})

//Update festival by festivalId
organizerRouter.put("/festival/:festivalId", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    const updatedContent = { ...req.body }
    for (const field of ["_id", "organizerId", "publishedScheduleId", "__v"]) delete updatedContent[field]
    let updatedFestival = await FestivalModel.findOneAndUpdate(
        {_id: festivalId},
        updatedContent,
        {new: true, runValidators: true}
    )
    if(!updatedFestival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, festival: updatedFestival})
})

//Delete festival by ID
organizerRouter.delete("/festival/:festivalId", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let deletedFestival = await FestivalModel.findOneAndDelete({_id: festivalId})
    if(!deletedFestival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, message: "Festival deleted successfully"})
})

//List registered attendees for a specific festival
organizerRouter.get("/festival/:festivalId/attendees", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let userIds = await RegistrationModel.distinct("userId", {festivalId})
    let attendees = await UserModel.find({_id: {$in: userIds}}).select("-password")
    let festival = await FestivalModel.exists({_id: festivalId})
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, attendees})
})

//List volunteers for specific festival
organizerRouter.get("/festival/:festivalId/volunteers", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let userIds = await FestivalMembershipModel.distinct("userId", {festivalId, membershipType: "volunteer", status: "active"})
    let volunteers = await UserModel.find({_id: {$in: userIds}}).select("-password")
    let festival = await FestivalModel.exists({_id: festivalId})
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, volunteers})
})

//Create a venue for festival
organizerRouter.post("/festival/:festivalId/venues", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let {userId} = req.user
    if(!Types.ObjectId.isValid(userId)){
        return res.status(400).json({message: "Invalid user ID"})
    }
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    let venueData = { ...(req.body || {}) }
    venueData.festivalId = festivalId
    let newVenue = await VenueModel.create(venueData)
    res.status(201).json({message: "Venue created successfully", venue: newVenue})
})

//Get all venues for a festival
organizerRouter.get("/festival/:festivalId/venues", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let venues = await VenueModel.find({festivalId: festivalId})
    res.status(200).json({success: true, venues: venues})
})

//Get specific venue by venueId
organizerRouter.get("/festival/:festivalId/venues/:venueId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId, venueId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(venueId)){
        return res.status(400).json({message: "Invalid venue ID"})
    }
    let venue = await VenueModel.findOne({_id: venueId, festivalId: festivalId})
    if(!venue){
        return res.status(404).json({message: "Venue not found"})
    }
    res.status(200).json({success: true, venue: venue})
})

//Update venue by venueId
organizerRouter.put("/festival/:festivalId/venues/:venueId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId, venueId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(venueId)){
        return res.status(400).json({message: "Invalid venue ID"})
    }
    let updatedContent = { ...req.body }
    for (const field of ["_id", "festivalId", "venueCode", "__v"]) delete updatedContent[field]
    let updatedVenue = await VenueModel.findOneAndUpdate({_id: venueId, festivalId: festivalId}, updatedContent, {new: true, runValidators: true})
    if(!updatedVenue){
        return res.status(404).json({message: "Venue not found"})
    }
    res.status(200).json({success: true, venue: updatedVenue})
})

//Delete venue by venueId
organizerRouter.delete("/festival/:festivalId/venues/:venueId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId, venueId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(venueId)){
        return res.status(400).json({message: "Invalid venue ID"})
    }
    const venueInUse = await Promise.all([
        ScheduleVersionModel.exists({festivalId, status: {$in: ["draft", "published"]}, "scheduleSnapshot.venueId": venueId}),
        ShiftModel.exists({festivalId, venueId}),
    ]);
    if (venueInUse.some(Boolean)) {
        return res.status(409).json({message: "Venue is referenced by a draft/published schedule or shift and cannot be deleted"});
    }
    let deletedVenue = await VenueModel.findOneAndDelete({_id: venueId, festivalId})
    if(!deletedVenue){
        return res.status(404).json({message: "Venue not found"})
    }
    res.status(200).json({success: true, message: "Venue deleted successfully"})
})

//Create a resource for festival
organizerRouter.post("/festival/:festivalId/resources", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival Id"})
    }
    let resourceData = { ...(req.body || {}) }
    resourceData.festivalId = festivalId
    let newResource = await ResourceModel.create(resourceData)
    res.status(201).json({success: true, message: "Resource created successfully", resource: newResource})
})

//Get all resources for a festival
organizerRouter.get("/festival/:festivalId/resources", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let resources = await ResourceModel.find({festivalId: festivalId})
    res.status(200).json({success: true, resources: resources})
})

//Get specific resource by resourceId
organizerRouter.get("/festival/:festivalId/resources/:resourceId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId, resourceId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(resourceId)){
        return res.status(400).json({message: "Invalid resource ID"})
    }
    let resource = await ResourceModel.findOne({_id: resourceId, festivalId: festivalId})
    if(!resource){
        return res.status(404).json({message: "Resource not found"})
    }
    res.status(200).json({success: true, resource: resource})
})

//Update resource by resourceId
organizerRouter.put("/festival/:festivalId/resources/:resourceId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId, resourceId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(resourceId)){
        return res.status(400).json({message: "Invalid resource ID"})
    }
    let updatedContent = { ...req.body }
    for (const field of ["_id", "festivalId", "__v"]) delete updatedContent[field]
    let updatedResource = await ResourceModel.findOneAndUpdate({_id: resourceId, festivalId: festivalId}, updatedContent, {new: true, runValidators: true})
    if(!updatedResource){
        return res.status(404).json({message: "Resource not found"})
    }
    res.status(200).json({success: true, resource: updatedResource})
})

//Delete resource by resourceId
organizerRouter.delete("/festival/:festivalId/resources/:resourceId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let {festivalId, resourceId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(resourceId)){
        return res.status(400).json({message: "Invalid resource ID"})
    }
    const resourceInUse = await Promise.all([
        ScheduleVersionModel.exists({festivalId, status: {$in: ["draft", "published"]}, "scheduleSnapshot.resourcesAllocated.resourceId": resourceId}),
        FestivalSessionModel.exists({festivalId, resourcesRequired: resourceId}),
    ]);
    if (resourceInUse.some(Boolean)) {
        return res.status(409).json({message: "Resource is required by a session or allocated in a draft/published schedule and cannot be deleted"});
    }
    let deletedResource = await ResourceModel.findOneAndDelete({_id: resourceId, festivalId: festivalId})
    if(!deletedResource){
        return res.status(404).json({message: "Resource not found"})
    }
    res.status(200).json({success: true, message: "Resource deleted successfully"})
})

//Create a festival session
organizerRouter.post("/festivals/:festivalId/sessions", verifyToken, allowedRoles(["organizer", "volunteer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let sessionData = { ...(req.body || {}) }
    for (const field of ["_id", "__v", "festivalId", "proposalStatus", "proposedBy", "reviewedBy", "reviewedAt", "reviewNote"]) {
        delete sessionData[field]
    }
    if (req.festivalRole === "volunteer") {
        delete sessionData.status
        sessionData.proposalStatus = "pending"
        sessionData.proposedBy = req.user.userId
        sessionData.reviewedBy = null
        sessionData.reviewedAt = null
        sessionData.reviewNote = ""
    } else {
        sessionData.proposalStatus = "approved"
    }
    sessionData.festivalId = festivalId
    const venueExists = await VenueModel.exists({_id: sessionData.venueId, festivalId})
    if (!venueExists) return res.status(400).json({message: "Session venue must belong to this festival"})
    const resourceIds = sessionData.resourcesRequired || []
    if (resourceIds.length) {
        const resourceCount = await ResourceModel.countDocuments({_id: {$in: resourceIds}, festivalId})
        if (resourceCount !== new Set(resourceIds.map(String)).size) {
            return res.status(400).json({message: "All required resources must belong to this festival"})
        }
    }
    let newSession = await FestivalSessionModel.create(sessionData)
    res.status(201).json({success: true, message: "Festival session created successfully", session: newSession})
})

//Get all festival sessions for a specific festival
organizerRouter.get("/festivals/:festivalId/sessions", verifyToken, allowedRoles(["organizer", "volunteer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    const query = {festivalId}
    if (req.festivalRole === "volunteer") {
        query.proposedBy = req.user.userId
    }
    if (req.query.proposalStatus && req.query.proposalStatus !== "all") {
        if (!["pending", "approved", "rejected"].includes(req.query.proposalStatus)) {
            return res.status(400).json({message: "Invalid proposal status filter"})
        }
        query.proposalStatus = req.query.proposalStatus
    }
    let sessions = await FestivalSessionModel.find(query)
    res.status(200).json({success: true, sessions: sessions})
})

//Get specific festival session by sessionId
organizerRouter.get("/festivals/:festivalId/sessions/:sessionId", verifyToken, allowedRoles(["organizer", "volunteer"]), async (req, res)=>{
    let {festivalId, sessionId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    let session = await FestivalSessionModel.findOne({_id: sessionId, festivalId: festivalId})
    if(!session){
        return res.status(404).json({message: "Festival session not found"})
    }
    if (req.festivalRole === "volunteer" && String(session.proposedBy) !== String(req.user.userId)) {
        return res.status(404).json({message: "Festival session not found"})
    }
    res.status(200).json({success: true, session: session})
})

//Update a session by sessionId
organizerRouter.put("/festivals/:festivalId/sessions/:sessionId", verifyToken, allowedRoles(["organizer", "volunteer"]), async (req, res)=>{
    let {festivalId, sessionId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    const session = await FestivalSessionModel.findOne({_id: sessionId, festivalId})
    if (!session) {
        return res.status(404).json({message: "Festival session not found"})
    }

    const requestBody = { ...(req.body || {}) }
    const updatedContent = {}
    const editableFields = [
        "title", "description", "sessionType", "startTime", "endTime", "venueId",
        "resourcesRequired", "maxParticipants", "registrationDeadline",
        "registrationFee", "registrationStartDate", "status", "volunteersAssigned",
    ]

    for (const field of editableFields) {
        if (Object.prototype.hasOwnProperty.call(requestBody, field)) {
            updatedContent[field] = requestBody[field]
        }
    }

    if (req.festivalRole === "volunteer") {
        if (
            String(session.proposedBy) !== String(req.user.userId) ||
            session.proposalStatus !== "pending"
        ) {
            return res.status(403).json({message: "You can only edit your own pending session proposals"})
        }
        const forbiddenFields = ["proposalStatus", "status", "proposedBy", "reviewedBy", "reviewedAt", "reviewNote", "volunteersAssigned"]
        if (forbiddenFields.some((field) => Object.prototype.hasOwnProperty.call(requestBody, field))) {
            return res.status(400).json({message: "Session leads cannot change proposal review or operational assignment fields"})
        }
    } else if (Object.prototype.hasOwnProperty.call(requestBody, "proposalStatus")) {
        if (session.proposalStatus !== "pending") {
            return res.status(409).json({message: "Only pending proposals can be approved or rejected"})
        }
        if (!["approved", "rejected"].includes(requestBody.proposalStatus)) {
            return res.status(400).json({message: "Proposal status must be approved or rejected"})
        }
        updatedContent.proposalStatus = requestBody.proposalStatus
        updatedContent.reviewedBy = req.user.userId
        updatedContent.reviewedAt = new Date()
        updatedContent.reviewNote = typeof requestBody.reviewNote === "string"
            ? requestBody.reviewNote.trim()
            : ""
    }

    if (updatedContent.venueId) {
        const venueExists = await VenueModel.exists({_id: updatedContent.venueId, festivalId})
        if (!venueExists) return res.status(400).json({message: "Session venue must belong to this festival"})
    }
    if (updatedContent.resourcesRequired) {
        const resourceCount = await ResourceModel.countDocuments({_id: {$in: updatedContent.resourcesRequired}, festivalId})
        if (resourceCount !== new Set(updatedContent.resourcesRequired.map(String)).size) {
            return res.status(400).json({message: "All required resources must belong to this festival"})
        }
    }
    let updatedSession = await FestivalSessionModel.findOneAndUpdate({_id: sessionId, festivalId: festivalId}, updatedContent, {new: true, runValidators: true})
    if(!updatedSession){
        return res.status(404).json({message: "Festival session not found"})
    }
    res.status(200).json({success: true, session: updatedSession})
})

//Delete a session by sessionId
organizerRouter.delete("/festivals/:festivalId/sessions/:sessionId", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId, sessionId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(sessionId)){
        return res.status(400).json({message: "Invalid session ID"})
    }
    const sessionInUse = await Promise.all([
        ScheduleVersionModel.exists({festivalId, status: {$in: ["draft", "published"]}, "scheduleSnapshot.sessionId": sessionId}),
        ShiftModel.exists({festivalId, sessionId}),
    ]);
    if (sessionInUse.some(Boolean)) {
        return res.status(409).json({message: "Session is referenced by a draft/published schedule or shift and cannot be deleted"});
    }
    let deletedSession = await FestivalSessionModel.findOneAndDelete({_id: sessionId, festivalId: festivalId})
    if(!deletedSession){
        return res.status(404).json({message: "Festival session not found"})
    }
    res.status(200).json({success: true, message: "Festival session deleted successfully"})
})

// Create a shift for a festival session and assign volunteers
organizerRouter.post("/festivals/:festivalId/sessions/:sessionId/shifts", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, sessionId } = req.params;
    const { volunteerIds, ...shiftFields } = req.body || {};
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid festival ID"
        });
    }
    if (!Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid session ID"
        });
    }
    const session = await FestivalSessionModel.findOne({
        _id: sessionId,
        festivalId: festivalId
    });
    if (!session) {
        return res.status(404).json({
            success: false,
            message: "Festival session not found"
        });
    }
    if (session.proposalStatus !== "approved") {
        return res.status(409).json({
            success: false,
            message: "Shifts can only be assigned to approved sessions"
        });
    }
    const venueExists = await VenueModel.exists({_id: shiftFields.venueId, festivalId})
    if (!venueExists) {
        return res.status(400).json({success: false, message: "Shift venue must belong to this festival"})
    }
    if (!Array.isArray(volunteerIds) || volunteerIds.length === 0) {
        return res.status(400).json({
            success: false,
            message: "At least one volunteer must be assigned"
        });
    }

    if (volunteerIds.some(
        id => !Types.ObjectId.isValid(id)
    )) {
        return res.status(400).json({
            success: false,
            message: "One or more volunteer IDs are invalid"
        });
    }
    const uniqueVolunteerIds = [...new Set(
        volunteerIds.map(id => String(id))
    )];
    if (uniqueVolunteerIds.length !== volunteerIds.length) {
        return res.status(400).json({
            success: false,
            message: "Duplicate volunteer IDs are not allowed"
        });
    }
    const volunteers = await FestivalMembershipModel.find({
        festivalId,
        userId: { $in: uniqueVolunteerIds },
        membershipType: "volunteer",
        status: "active"
    }).select("userId");
    if (volunteers.length !== uniqueVolunteerIds.length) {
        return res.status(400).json({
            success: false,
            message: "One or more selected users are not valid volunteers"
        });
    }
    const shiftStart = new Date(shiftFields.startTime);
    const shiftEnd = new Date(shiftFields.endTime);
    if (!Number.isFinite(shiftStart.getTime()) || !Number.isFinite(shiftEnd.getTime()) || shiftStart >= shiftEnd) {
        return res.status(400).json({success: false, message: "Shift end time must be after a valid start time"});
    }
    const overlappingShift = await ShiftModel.exists({
        festivalId,
        volunteers: {$in: uniqueVolunteerIds},
        status: {$ne: "cancelled"},
        startTime: {$lt: shiftEnd},
        endTime: {$gt: shiftStart},
    });
    if (overlappingShift) {
        return res.status(409).json({success: false, message: "One or more volunteers already have an overlapping shift"});
    }
    const shiftData = {
        ...shiftFields,
        festivalId,
        sessionId,
        volunteers: volunteers.map(volunteer => volunteer.userId)
    };
    const newShift = await ShiftModel.create(shiftData);
    return res.status(201).json({success: true, message: "Shift created successfully", shift: newShift});
});

//List all shifts for a specific festival session
organizerRouter.get("/festivals/:festivalId/sessions/:sessionId/shifts", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, sessionId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({success: false, message: "Invalid session ID"});
    }
    const session = await FestivalSessionModel.findOne({_id: sessionId, festivalId: festivalId});
    if (!session) {
        return res.status(404).json({success: false, message: "Festival session not found"});
    }
    const shifts = await ShiftModel.find({festivalId, sessionId}).populate("volunteers", "-name -email");
    return res.status(200).json({success: true, shifts: shifts});
})

//List specific shift by shiftId
organizerRouter.get("/festivals/:festivalId/sessions/:sessionId/shifts/:shiftId", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, sessionId, shiftId } = req.params
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({success: false, message: "Invalid session ID"});
    }
    if (!Types.ObjectId.isValid(shiftId)) {
        return res.status(400).json({success: false, message: "Invalid shift ID"});
    }
    const shift = await ShiftModel.findOne({_id: shiftId, festivalId: festivalId, sessionId: sessionId}).populate("volunteers", "-name -email");
    if (!shift) {
        return res.status(404).json({success: false, message: "Shift not found"});
    }
    return res.status(200).json({success: true, shift: shift});
})

//Update shift by shiftId
organizerRouter.put("/festivals/:festivalId/sessions/:sessionId/shifts/:shiftId", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, sessionId, shiftId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({success: false, message: "Invalid session ID"});
    }
    if (!Types.ObjectId.isValid(shiftId)) {
        return res.status(400).json({success: false, message: "Invalid shift ID"});
    }
    const existingShift = await ShiftModel.findOne({_id: shiftId, festivalId, sessionId});
    if (!existingShift) {
        return res.status(404).json({success: false, message: "Shift not found"});
    }
    const updatedContent = { ...(req.body || {}), festivalId, sessionId };
    for (const field of ["_id", "__v"]) delete updatedContent[field]
    if (updatedContent.venueId) {
        const venueExists = await VenueModel.exists({_id: updatedContent.venueId, festivalId})
        if (!venueExists) return res.status(400).json({success: false, message: "Shift venue must belong to this festival"})
    }
    if (updatedContent.volunteers) {
        if (!Array.isArray(updatedContent.volunteers)) {
            return res.status(400).json({success: false, message: "Volunteers must be an array"})
        }
        if (updatedContent.volunteers.length === 0 || updatedContent.volunteers.some(id => !Types.ObjectId.isValid(id))) {
            return res.status(400).json({success: false, message: "At least one valid volunteer must be assigned"})
        }
        if (new Set(updatedContent.volunteers.map(String)).size !== updatedContent.volunteers.length) {
            return res.status(400).json({success: false, message: "Duplicate volunteer IDs are not allowed"})
        }
        const memberships = await FestivalMembershipModel.countDocuments({
            festivalId,
            userId: {$in: updatedContent.volunteers},
            membershipType: "volunteer",
            status: "active"
        })
        if (memberships !== new Set(updatedContent.volunteers.map(String)).size) {
            return res.status(400).json({success: false, message: "All assigned volunteers must be active festival volunteers"})
        }
    }
    const effectiveVolunteers = updatedContent.volunteers || existingShift.volunteers;
    const effectiveStart = new Date(updatedContent.startTime ?? existingShift.startTime);
    const effectiveEnd = new Date(updatedContent.endTime ?? existingShift.endTime);
    if (!Number.isFinite(effectiveStart.getTime()) || !Number.isFinite(effectiveEnd.getTime()) || effectiveStart >= effectiveEnd) {
        return res.status(400).json({success: false, message: "Shift end time must be after a valid start time"});
    }
    const overlappingShift = await ShiftModel.exists({
        _id: {$ne: shiftId},
        festivalId,
        volunteers: {$in: effectiveVolunteers},
        status: {$ne: "cancelled"},
        startTime: {$lt: effectiveEnd},
        endTime: {$gt: effectiveStart},
    });
    if (overlappingShift) {
        return res.status(409).json({success: false, message: "One or more volunteers already have an overlapping shift"});
    }
    const updatedShift = await ShiftModel.findOneAndUpdate({_id: shiftId, festivalId: festivalId, sessionId: sessionId}, updatedContent, {new: true, runValidators: true}).populate("volunteers", "-name -email");
    if (!updatedShift) {
        return res.status(404).json({success: false, message: "Shift not found"});
    }
    return res.status(200).json({success: true, shift: updatedShift});
})

//Delete shift by shiftId
organizerRouter.delete("/festivals/:festivalId/sessions/:sessionId/shifts/:shiftId", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, sessionId, shiftId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(sessionId)) {
        return res.status(400).json({success: false, message: "Invalid session ID"});
    }
    if (!Types.ObjectId.isValid(shiftId)) {
        return res.status(400).json({success: false, message: "Invalid shift ID"});
    }
    const deletedShift = await ShiftModel.findOneAndDelete({_id: shiftId, festivalId: festivalId, sessionId: sessionId});
    if (!deletedShift) {
        return res.status(404).json({success: false, message: "Shift not found"});
    }
    return res.status(200).json({success: true, message: "Shift deleted successfully"});
})

//Create a draft schedule version for a festival
organizerRouter.post("/festivals/:festivalId/schedule-versions", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    const festival = await FestivalModel.findById(festivalId);
    if (!festival) {
        return res.status(404).json({success: false, message: "Festival not found"});
    }
    const latestVersion = await ScheduleVersionModel.findOne({festivalId})
        .sort({version: -1})
        .select("version")
        .lean();
    const scheduleData = {
        ...(req.body || {}),
        festivalId,
        version: (latestVersion?.version || 0) + 1,
        baseVersionId: festival.publishedScheduleId || null,
        createdBy: req.user.userId,
        status: "draft"
    };
    delete scheduleData._id;
    delete scheduleData.__v;
    const newScheduleVersion = await ScheduleVersionModel.create(scheduleData);
    return res.status(201).json({success: true, message: "Draft schedule version created successfully", scheduleVersion: newScheduleVersion});
})

//List all schedule versions for a festival
organizerRouter.get("/festivals/:festivalId/schedule-versions", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    const scheduleVersions = await ScheduleVersionModel.find({festivalId: festivalId});
    if (!scheduleVersions || scheduleVersions.length === 0) {
        return res.status(404).json({success: false, message: "No schedule versions found for this festival"});
    }
    return res.status(200).json({success: true, scheduleVersions: scheduleVersions});
})

//Get specific schedule version by versionId
organizerRouter.get("/festivals/:festivalId/schedule-versions/:versionId", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, versionId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(versionId)) {
        return res.status(400).json({success: false, message: "Invalid version ID"});
    }
    const scheduleVersion = await ScheduleVersionModel.findOne({_id: versionId, festivalId: festivalId});
    if (!scheduleVersion) {
        return res.status(404).json({success: false, message: "Schedule version not found"});
    }
    return res.status(200).json({success: true, scheduleVersion: scheduleVersion});
})

//Update schedule version by versionId
organizerRouter.put("/festivals/:festivalId/schedule-versions/:versionId", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, versionId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(versionId)) {
        return res.status(400).json({success: false, message: "Invalid version ID"});
    }
    const existingVersion = await ScheduleVersionModel.findOne({_id: versionId, festivalId});
    if (!existingVersion) {
        return res.status(404).json({success: false, message: "Schedule version not found"});
    }
    if (existingVersion.status !== "draft") {
        return res.status(409).json({success: false, message: "Only draft schedule versions can be edited"});
    }
    const updatedContent = { ...(req.body || {}), festivalId };
    for (const field of ["_id", "createdBy", "version", "status", "conflictDetails", "__v"]) delete updatedContent[field]
    const updatedScheduleVersion = await ScheduleVersionModel.findOneAndUpdate({_id: versionId, festivalId: festivalId, status: "draft"}, updatedContent, {new: true, runValidators: true});
    if (!updatedScheduleVersion) {
        return res.status(404).json({success: false, message: "Schedule version not found"});
    }
    return res.status(200).json({success: true, scheduleVersion: updatedScheduleVersion});
})

//Publish a schedule version by versionId
organizerRouter.post("/festivals/:festivalId/schedule-versions/:versionId/publish", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, versionId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(versionId)) {
        return res.status(400).json({success: false, message: "Invalid version ID"});
    }
    const scheduleVersion = await ScheduleVersionModel.findOne({_id: versionId, festivalId: festivalId});
    if (!scheduleVersion) {
        return res.status(404).json({success: false, message: "Schedule version not found"});
    }
    if (scheduleVersion.status !== "draft") {
        return res.status(409).json({success: false, message: "Only draft schedule versions can be published"});
    }
    const validation = await validateScheduleVersion({festivalId, versionId});
    if (!validation.isValid) {
        return res.status(409).json({
            success: false,
            message: "Resolve all schedule conflicts before publishing",
            conflictCount: validation.conflictCount,
            conflicts: validation.conflicts,
        });
    }
    scheduleVersion.conflictDetails = validation.conflicts;
    scheduleVersion.status = "published"
    await scheduleVersion.save()
    await FestivalModel.findByIdAndUpdate(festivalId, {publishedScheduleId: scheduleVersion._id})
    return res.status(200).json({success: true, scheduleVersion: scheduleVersion});
})

//Validate schedule version for conflicts by versionId
organizerRouter.post("/festivals/:festivalId/schedule-versions/:versionId/validate", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, versionId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(versionId)) {
        return res.status(400).json({success: false, message: "Invalid version ID"});
    }
    const scheduleVersion = await ScheduleVersionModel.findOne({_id: versionId, festivalId: festivalId});
    if (!scheduleVersion) {
        return res.status(404).json({success: false, message: "Schedule version not found"});
    }
    if(scheduleVersion.status !== "draft"){
        return res.status(400).json({success: false, message: "Only draft schedule versions can be validated"});
    }
    const result = await validateScheduleVersion({
        festivalId: festivalId,
        versionId: versionId
    });

    res.status(200).json({success: true, validationResult: result})
})

//List all conflicts for a specific schedule version
organizerRouter.get("/festivals/:festivalId/schedule-versions/:versionId/conflicts", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    let { festivalId, versionId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(versionId)) {
        return res.status(400).json({success: false, message: "Invalid version ID"});
    }
    const scheduleVersion = await ScheduleVersionModel.findOne({_id: versionId, festivalId: festivalId});
    if (!scheduleVersion) {
        return res.status(404).json({success: false, message: "Schedule version not found"});
    }
    let conflicts = scheduleVersion.conflictDetails || []
    let total = conflicts.length
    let unresolved = conflicts.filter(conflict => !conflict.resolved).length
    let resolved = total - unresolved
    res.status(200).json({success: true, scheduleVersionId: versionId, totalConflicts: total, resolvedConflicts: resolved, unresolvedConflicts: unresolved, conflicts: conflicts})
})

//Retrieve a specific conflict by conflictId for a schedule version
organizerRouter.get("/festivals/:festivalId/schedule-versions/:versionId/conflicts/:conflictId", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    let { festivalId, versionId, conflictId } = req.params;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(versionId)) {
        return res.status(400).json({success: false, message: "Invalid version ID"});
    }
    if (!Types.ObjectId.isValid(conflictId)) {
        return res.status(400).json({success: false, message: "Invalid conflict ID"});
    }
    const scheduleVersion = await ScheduleVersionModel.findOne({_id: versionId, festivalId: festivalId});
    if (!scheduleVersion) {
        return res.status(404).json({success: false, message: "Schedule version not found"});
    }
    const conflict = scheduleVersion.conflictDetails.find(conflict => String(conflict._id) === String(conflictId));
    if (!conflict) {
        return res.status(404).json({success: false, message: "Conflict not found"});
    }
    res.status(200).json({success: true, conflict: conflict})
})

//Resolve or acknowledge a specific conflict by conflictId for a schedule version
organizerRouter.patch("/festivals/:festivalId/schedule-versions/:versionId/conflicts/:conflictId", verifyToken, allowedRoles(["organizer"]), async (req, res) => {
    const { festivalId, versionId, conflictId } = req.params;
    const { expectedUpdatedAt } = req.body || {};
    if (
      !Types.ObjectId.isValid(festivalId) ||
      !Types.ObjectId.isValid(versionId) ||
      !Types.ObjectId.isValid(conflictId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid festival, schedule version, or conflict ID.",
      });
    }
    if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
      return res.status(400).json({
        success: false,
        message: "expectedUpdatedAt from the loaded schedule version is required.",
      });
    }
    const version = await ScheduleVersionModel.findOne({
      _id: versionId,
      festivalId,
    });

    if (!version) {
      return res.status(404).json({
        success: false,
        message: "Schedule version not found.",
      });
    }

    if (version.status !== "draft") {
      return res.status(409).json({
        success: false,
        message: "Conflicts can only be resolved on a draft schedule version.",
      });
    }

    if (new Date(expectedUpdatedAt).getTime() !== version.updatedAt.getTime()) {
      return res.status(409).json({
        success: false,
        message: "The schedule changed. Reload it and review the latest conflicts.",
        currentUpdatedAt: version.updatedAt,
      });
    }

    const targetConflict = version.conflictDetails.id(conflictId);

    if (!targetConflict) {
      return res.status(404).json({
        success: false,
        message: "Conflict not found on this schedule version.",
      });
    }

    if (targetConflict.resolved) {
      return res.status(409).json({
        success: false,
        message: "This conflict is already marked resolved.",
      });
    }

    const targetIdentity = conflictIdentity(targetConflict);

    // Recalculate against the current draft. This refreshes conflictDetails.
    const validation = await validateScheduleVersion({
      festivalId,
      versionId,
    });

    const conflictStillExists = validation.conflicts.some(
      (conflict) => conflictIdentity(conflict) === targetIdentity
    );

    if (conflictStillExists) {
      return res.status(409).json({
        success: false,
        resolved: false,
        message: "The conflict still exists in the current schedule.",
        conflictCount: validation.conflictCount,
        conflicts: validation.conflicts,
      });
    }

    return res.status(200).json({
      success: true,
      resolved: true,
      conflictId,
      message: "The conflict is no longer present after schedule validation.",
      scheduleIsValid: validation.isValid,
      remainingConflictCount: validation.conflictCount,
      conflicts: validation.conflicts,
    });
  }
);

//Ingest a document
organizerRouter.post("/festivals/:festivalId/documents", verifyToken, allowedRoles(["organizer"]), documentUpload.single("file"), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    let title = req.body?.title?.trim() || ""
    if(!title){
        return res.status(400).json({message: "Document title is required"})
    }
    let uploadedFile = req.file
    if(!uploadedFile){
        return res.status(400).json({message: "No file uploaded"})
    }
    if(uploadedFile.mimetype !== "application/pdf"){
        return res.status(400).json({message: "Only PDF files are allowed"})
    }
    let dtype = req.body.documentType || "other"
    if(!['policy', 'guideline', 'announcement', 'schedule', 'other'].includes(dtype)){
        return res.status(400).json({message: "Invalid document type"})
    }
    let visibility = req.body.visibility || "organizer"
    if(!['public', 'staff', 'organizer'].includes(visibility)){
        return res.status(400).json({message: "Invalid document visibility"})
    }
    let content = await extractTextFromPDF(uploadedFile.buffer)
    if(!content){
        return res.status(400).json({message: "The uploaded PDF contains no extractable text"})
    }
    const documentId = new Types.ObjectId()
    const chunks = await splitArticleIntoChunks(content)
    const chunkRecords = (await generateChunkEmbeddings(festivalId, documentId, chunks))
        .map(chunk => ({...chunk, visibility}))
    if(!chunkRecords.length){
        return res.status(400).json({message: "The uploaded PDF contains no indexable text"})
    }
    let document = await DocumentModel.create({
        _id: documentId,
        festivalId: festivalId,
        title: title,
        content: content,
        author: req.user.userId,
        documentType: dtype,
        visibility,
    })
    await ChunkModel.insertMany(chunkRecords).catch(async error => {
        await Promise.allSettled([
            ChunkModel.deleteMany({festivalId, documentId}),
            DocumentModel.deleteOne({_id: documentId, festivalId}),
        ])
        throw error
    })
    return res.status(201).json({
        success: true,
        message: "Document created successfully",
        document,
        indexedChunkCount: chunkRecords.length,
    })
})

//List document metadata for a festival
organizerRouter.get("/festivals/:festivalId/documents", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    let documents = await DocumentModel.find({festivalId}).select("-content").sort({createdAt: -1})
    res.status(200).json({success: true, documents})
})

//Get specific document metadata by documentId
organizerRouter.get("/festivals/:festivalId/documents/:documentId", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId, documentId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(documentId)){
        return res.status(400).json({message: "Invalid document ID"})
    }
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    let document = await DocumentModel.findOne({_id: documentId, festivalId}).select("-content")
    if(!document){
        return res.status(404).json({message: "Document not found"})
    }
    res.status(200).json({success: true, document})
})

//Delete a document by documentId
organizerRouter.delete("/festivals/:festivalId/documents/:documentId", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let {festivalId, documentId} = req.params
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(documentId)){
        return res.status(400).json({message: "Invalid document ID"})
    }
    let festival = await FestivalModel.findById(festivalId)
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    await ChunkModel.deleteMany({festivalId, documentId})
    let deletedDocument = await DocumentModel.findOneAndDelete({_id: documentId, festivalId})
    if(!deletedDocument){
        return res.status(404).json({message: "Document not found"})
    }
    res.status(200).json({success: true, message: "Document deleted successfully"})
})

//Operations agent
