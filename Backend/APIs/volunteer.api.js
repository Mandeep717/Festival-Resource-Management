import exp from 'express';
import { hash, compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import crypto from "crypto";
import { verifyToken } from "../Middlewares/verify-token.middleware.js";
import { UserModel } from "../Models/user.model.js";
import { EmailTokenModel } from "../Models/email-token.model.js";
import { ShiftModel } from "../Models/shift.model.js";
import { FestivalModel } from "../Models/festival.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { FestivalMembershipModel } from "../Models/festival-membership.model.js";

export const volunteerRouter = exp.Router()

//Register a new volunteer
volunteerRouter.post('/register', async(req, res)=>{
    const { email, password, name } = req.body || {}
    if (typeof email !== "string" || typeof password !== "string" || typeof name !== "string" || !email.trim() || !password || !name.trim()) return res.status(400).json({message: "Email, password, and name are required"})
    const hashedPassword = await hash(password, 12);
    let newVolunteer = await UserModel.create({email, name, password: hashedPassword, accountType: "volunteer"})
    const volunteer = newVolunteer.toObject()
    delete volunteer.password
    res.status(201).json({message: "Volunteer account created; festival access requires an active volunteer membership", volunteer})
})

//Apply for volunteer membership in a festival
volunteerRouter.post("/festivals/:festivalId/membership/apply", verifyToken, async (req, res) => {
    const { festivalId } = req.params;
    const volunteerId = req.user.userId;
    if (!Types.ObjectId.isValid(festivalId)) {
        return res.status(400).json({success: false, message: "Invalid festival ID"});
    }
    if (!Types.ObjectId.isValid(volunteerId)) {
        return res.status(400).json({success: false, message: "Invalid volunteer ID"});
    }
    const [festival, volunteer] = await Promise.all([
        FestivalModel.findById(festivalId),
        UserModel.findById(volunteerId).select("accountType status"),
    ]);
    if (!festival) {
        return res.status(404).json({success: false, message: "Festival not found"});
    }
    if (!volunteer) {
        return res.status(404).json({success: false, message: "Volunteer not found"});
    }
    if (volunteer.accountType !== "volunteer" || volunteer.status !== "active") {
        return res.status(403).json({success: false, message: "An active volunteer account is required"});
    }
    const existingMembership = await FestivalMembershipModel.findOne({
        festivalId,
        userId: volunteerId,
        membershipType: "volunteer",
    });
    if (existingMembership?.status === "active") {
        return res.status(200).json({success: true, message: "Volunteer membership is already active", membership: existingMembership});
    }
    const membership = existingMembership
        ? await FestivalMembershipModel.findByIdAndUpdate(existingMembership._id, {status: "active"}, {new: true, runValidators: true})
        : await FestivalMembershipModel.create({festivalId, userId: volunteerId, membershipType: "volunteer", status: "active"});
    return res.status(existingMembership ? 200 : 201).json({success: true, message: "Volunteer membership activated successfully", membership});
});

//Login a volunteer
volunteerRouter.post('/login', async(req, res)=>{
    let volunteerCred = req.body || {}
    if(typeof volunteerCred.email !== "string" || typeof volunteerCred.password !== "string" || !volunteerCred.email.trim() || !volunteerCred.password) {
        return res.status(400).json({message: "Email and password are required"})
    }
    const user = await UserModel.findOne({ email: volunteerCred.email.trim().toLowerCase() });
    if (!user || user.status !== "active") {
        return res.status(401).json({message: "Invalid credentials"})
    }
    const isMatch = await compare(volunteerCred.password, user.password);
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
volunteerRouter.post('/logout', verifyToken, (req, res)=>{
    res.clearCookie("token");
    res.status(200).json({ message: "Logout successful" });
})

//Get profile of logged-in volunteer
volunteerRouter.get('/me', verifyToken, async(req, res)=>{
    let volunteerId = req.user.userId
    if(!Types.ObjectId.isValid(volunteerId)){
        return res.status(400).json({message: "Invalid volunteer ID"})
    }
    let volunteer = await UserModel.findById(volunteerId).select("-password")
    if(!volunteer){
        return res.status(404).json({message: "Volunteer not found"})
    }
    res.status(200).json({success: true, profile: volunteer, message: "Volunteer profile retrieved successfully"})
})

//Change password of logged-in volunteer
volunteerRouter.put('/change-password', verifyToken, async(req, res)=>{
    let volunteerId = req.user.userId
    if(!volunteerId){
        return res.status(400).json({message: "Volunteer ID is required"})
    }
    if(!Types.ObjectId.isValid(volunteerId)){
        return res.status(400).json({message: "Invalid volunteer ID"})
    }
    let { oldPassword, newPassword } = req.body || {}
    let volunteer = await UserModel.findById(volunteerId)
    if(!volunteer){
        return res.status(404).json({message: "Volunteer not found"})
    }
    const isMatch = await compare(oldPassword, volunteer.password);
    if (!isMatch) {
        return res.status(401).json({message: "Old password is incorrect"})
    }
    const newHashed = await hash(newPassword, 12);
    volunteer.password = newHashed
    await volunteer.save()
    res.status(200).json({success: true, message: "Password changed successfully"})
})

// Forgot password
volunteerRouter.post("/forgot-password", async (req, res) => {
    const { email } = req.body || {};
    if (typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ message: "Email is required" });
    }
    const user = await UserModel.findOne({
        email: email.trim().toLowerCase(),
        accountType: "volunteer",
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

//List of festivals accessible to volunteers
volunteerRouter.get("/festivals", verifyToken, async(req, res)=>{
    const volunteerId = req.user.userId
    if (!Types.ObjectId.isValid(volunteerId)) {
        return res.status(400).json({message: "Invalid volunteer ID"})
    }
    const festivalIds = await FestivalMembershipModel.distinct("festivalId", {
        userId: volunteerId,
        membershipType: "volunteer",
        status: "active"
    })
    let festivals = await FestivalModel.find({_id: {$in: festivalIds}})
    res.status(200).json({success: true, festivals: festivals, message: "Festivals retrieved successfully"})
})

//Assignments of the volunteer
volunteerRouter.get("/assignments", verifyToken, async(req, res)=>{
    let volunteerId = req.user.userId
    if(!Types.ObjectId.isValid(volunteerId)){
        return res.status(400).json({message: "Invalid volunteer ID"})
    }
    let assignments = await ShiftModel.find({volunteers: volunteerId}).populate("festivalId", "-__v")
    res.status(200).json({success: true, assignments: assignments, message: "Assignments retrieved successfully"})
})

//Update assignment status
volunteerRouter.put("/assignments/:shiftId/status", verifyToken, async(req, res)=>{
    let volunteerId = req.user.userId
    if(!Types.ObjectId.isValid(volunteerId)){
        return res.status(400).json({message: "Invalid volunteer ID"})
    }
    let {shiftId} = req.params
    if(!Types.ObjectId.isValid(shiftId)){
        return res.status(400).json({message: "Invalid shift ID"})
    }
    let shift = await ShiftModel.findOne({_id: shiftId, volunteers: volunteerId})
    if(!shift){
        return res.status(404).json({message: "Shift not found"})
    }
    let { status } = req.body || {}
    if(!status || !["scheduled", "ongoing", "completed", "cancelled"].includes(status)){
        return res.status(400).json({message: "Invalid status"})
    }
    shift.status = status
    await shift.save()
    res.status(200).json({success: true, message: "Shift status updated successfully"})
})

