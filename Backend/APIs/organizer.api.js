import exp from 'express';
import { hash, compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import crypto from "crypto";
import { verifyToken } from "../Middlewares/verify-token.middleware.js";
import { UserModel } from "../Models/user.model.js";
import { EmailTokenModel } from "../Models/email-token.model.js";
import { allowedRoles } from "../Middlewares/allowed-roles.middleware.js";
import {FestivalModel} from "../Models/festival.model.js";

const organizerRouter = exp.Router()

//Register a new organizer
organizerRouter.post('/register', async(req, res)=>{
    let organizerData = req.body
    const hashedPassword = await hash(organizerData.password, 12);
    organizerData.password = hashedPassword;
    let newOrganizer = await UserModel.create(organizerData)
    res.status(201).json({message: "Organizer registered successfully", organizer: newOrganizer})
})

//Login an organizer
organizerRouter.post('/login', async(req, res)=>{
    let organizerCred = req.body
    if(!organizerCred.email || !organizerCred.password) {
        return res.status(400).json({message: "Email and password are required"})
    }
    const user = await UserModel.findOne({ email: organizerCred.email });
    if (!user) {
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
    let { oldPassword, newPassword } = req.body
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
organizerRouter.post("/forgot-password", async (req, res, next) => {
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

//Create a new festival
organizerRouter.post('/festivals', verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let organizerId = req.user.userId
    if(!Types.ObjectId.isValid(organizerId)){
        return res.status(400).json({message: "Invalid organizer ID"})
    }
    let organizer = await UserModel.findById(organizerId)
    if(!organizer){
        return res.status(404).json({message: "Organizer not found"})
    }
    let festivalData = req.body
    festivalData.organizer = organizerId
    let newFestival = await FestivalModel.create(festivalData)
    res.status(201).json({message: "Festival created successfully", festival: newFestival})
})

//Get all festivals
organizerRouter.get("/festivals", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let festivalsInDb = await FestivalModel.find({organizer: req.user.userId})
    res.status(200).json({success: true, festivals: festivalsInDb})
})

//Get specific festival by festivalId
organizerRouter.get("/festival/:festivalId", verifyToken, allowedRoles(["organizer"]), async(req, res)=>{
    let festivalId = req.params.festivalId
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
    let festivalId = req.params.festivalId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let updatedContent = req.body
    let updatedFestival = await FestivalModel.findByIdAndUpdate(festivalId, updatedContent, {new: true, runValidators: true})
    if(!updatedFestival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, festival: updatedFestival})
})

//Delete festival by ID
organizerRouter.delete("/festival/:festivalId", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let festivalId = req.params.festivalId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let deletedFestival = await FestivalModel.findByIdAndDelete(festivalId)
    if(!deletedFestival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, message: "Festival deleted successfully"})
})

//List registered attendees for a specific festival
organizerRouter.get("/festival/:festivalId/attendees", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let festivalId = req.params.festivalId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let festival = await FestivalModel.findById(festivalId).populate("attendees", "-name -email")
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, attendees: festival.attendees})
})

//List volunteers for specific festival
organizerRouter.get("/festival/:festivalId/volunteers", verifyToken, allowedRoles(["organizer"]), async (req, res)=>{
    let festivalId = req.params.festivalId
    if(!Types.ObjectId.isValid(festivalId)){
        return res.status(400).json({message: "Invalid festival ID"})
    }
    let festival = await FestivalModel.findById(festivalId).populate("volunteers", "-name -email")
    if(!festival){
        return res.status(404).json({message: "Festival not found"})
    }
    res.status(200).json({success: true, volunteers: festival.volunteers})
})