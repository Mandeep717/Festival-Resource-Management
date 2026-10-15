import exp from 'express';
import { hash, compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import crypto from "crypto";
import { verifyToken } from "../Middlewares/verifyToken.js";
import { UserModel } from "../Models/user.model.js";
import { EmailTokenModel } from "../Models/email-token.model.js";
import { FestivalModel } from "../Models/festival.model.js";
import { RegistrationModel } from "../Models/registration.model.js";

export const attendeeRouter = exp.Router()

//Register a new attendee
attendeeRouter.post('/register', async(req, res)=>{
    let attendeeData = req.body
    const hashedPassword = await hash(attendeeData.password, 12);
    attendeeData.password = hashedPassword;
    let newAttendee = await UserModel.create(attendeeData)
    res.status(201).json({message: "Attendee registered successfully", attendee: newAttendee})
})

//Login an attendee
attendeeRouter.post('/login', async(req, res)=>{
    let attendeeCred = req.body
    if(!attendeeCred.email || !attendeeCred.password) {
        return res.status(400).json({message: "Email and password are required"})
    }
    const user = await UserModel.findOne({ email: attendeeCred.email });
    if (!user) {
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
    let { oldPassword, newPassword } = req.body
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
attendeeRouter.post("/forgot-password", async (req, res, next) => {
    let { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: "Email is required" });
    }
    let response = {
        success: true,
        message: "If the email exists, a password reset link will be sent",
    }
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    await EmailTokenModel.deleteMany({
        userId: user._id,
        purpose: "password-reset",
    });

    // Store the hashed token with an expiration time.
    await EmailTokenModel.create({
        userId: user._id,
        tokenHash: hashedToken,
        purpose: "password-reset",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    return res.status(200).json(response);
})

//List all festivals
attendeeRouter.get("/festivals", async(req, res)=>{
    let festivals = await FestivalModel.find()
    res.status(200).json({success: true, festivals: festivals, message: "Festivals retrieved successfully"})
})

//Get details of a specific festival
attendeeRouter.get("/festivals/:festivalId", async(req, res)=>{
    let festivalId = req.params.festivalId
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
    let festivalId = req.params.festivalId
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
    let existingRegistration = await RegistrationModel.findOne({festival: festivalId, attendee: attendeeId})
    if(existingRegistration){
        return res.status(400).json({message: "You have already registered for this festival"})
    }
    let registrationDetails = req.body
    if(festival.status !== "upcoming"){
        return res.status(400).json({message: "Registration is closed for this festival"})
    }
    if(new Date() > festival.registrationDeadline){
        return res.status(400).json({message: "Registration deadline has passed"})
    }
    let newRegistration = await RegistrationModel.create({
        ...registrationDetails,
        festival: festivalId,
        attendee: attendeeId
    });
    res.status(201).json({message: "Registration successful", registration: newRegistration})
})

//Check registration status
attendeeRouter.get("/festivals/:festivalId/registration-status", verifyToken, async(req, res)=>{
    let festivalId = req.params.festivalId
    let attendeeId = req.user.userId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    if(!Types.ObjectId.isValid(attendeeId)){
        return res.status(400).json({message: "Invalid attendee ID"})
    }
    let registration = await RegistrationModel.findOne({festival: festivalId, attendee: attendeeId})
    if(!registration){
        return res.status(404).json({message: "You have not registered for this festival"})
    }
    res.status(200).json({success: true, registration: registration, message: "Registration status retrieved successfully"})
})

