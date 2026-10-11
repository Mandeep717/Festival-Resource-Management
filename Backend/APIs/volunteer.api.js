import exp from 'express';
import { hash, compare } from "bcryptjs";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import crypto from "crypto";

import { UserModel } from "../Models/user.model.js";
import { EmailTokenModel } from "../Models/email-token.model.js";

const volunteerRouter = exp.Router()

//Register a new volunteer
volunteerRouter.post('/register', async(req, res)=>{
    let volunteerData = req.body
    const hashedPassword = await hash(volunteerData.password, 12);
    volunteerData.password = hashedPassword;
    let newVolunteer = new UserModel.create(volunteerData)
    res.status(201).json({message: "Volunteer registered successfully", volunteer: newVolunteer})
})

//Login a volunteer
volunteerRouter.post('/login', async(req, res)=>{
    let volunteerCred = req.body
    if(!volunteerCred.email || !volunteerCred.password) {
        return res.status(400).json({message: "Email and password are required"})
    }
    const user = await UserModel.findOne({ email: volunteerCred.email });
    if (!user) {
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
volunteerRouter.get('/profile:id', verifyToken, async(req, res)=>{
    let volunteerId = req.params.id
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
volunteerRouter.put('/change-password:id', verifyToken, async(req, res)=>{
    let volunteerId = req.params.id
    if(!Types.ObjectId.isValid(volunteerId)){
        return res.status(400).json({message: "Invalid volunteer ID"})
    }
    let { oldPassword, newPassword } = req.body
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
volunteerRouter.post("/forgot-password", async (req, res, next) => {
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

