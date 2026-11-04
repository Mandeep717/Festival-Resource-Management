import exp from 'express'
import {connect} from 'mongoose'
import cookieParser from "cookie-parser";
import dotenv from 'dotenv'

const app = exp()
dotenv.config()
const PORT = process.env.PORT || 3000
const allowedOrigins = new Set((process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map((origin) => origin.trim()).filter(Boolean))

app.disable("x-powered-by")
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff")
    res.setHeader("X-Frame-Options", "DENY")
    res.setHeader("Referrer-Policy", "same-origin")
    const origin = req.get("Origin")
    if (origin && !allowedOrigins.has(origin)) return res.status(403).json({success: false, message: "Request origin is not allowed"})
    if (origin) {
        res.setHeader("Access-Control-Allow-Origin", origin)
        res.setHeader("Vary", "Origin")
        res.setHeader("Access-Control-Allow-Credentials", "true")
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization")
    }
    if (req.method === "OPTIONS") return res.sendStatus(204)
    return next()
})
// A small JSON limit prevents accidental or abusive oversized API payloads.
app.use(exp.json({ limit: "1mb" }))
app.use(cookieParser())

import { publicRouter } from './Backend/APIs/public.api.js'
import { volunteerRouter } from './Backend/APIs/volunteer.api.js'
import { attendeeRouter } from './Backend/APIs/attendee.api.js'
import { organizerRouter } from './Backend/APIs/organizer.api.js'
import { adminRouter } from './Backend/APIs/admin.api.js'

app.use('/api', publicRouter)
app.use('/api/volunteer', volunteerRouter)
app.use('/api/attendee', attendeeRouter)
app.use('/api/organizer', organizerRouter)
app.use('/api/admin', adminRouter)

async function connectToDb(){
    try{
        await connect(process.env.MONGODB_URI)
        console.log("Connected to MongoDB")
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`)
        })
    } catch (error) {
        console.error("Error connecting to MongoDB", error)
    }
}

// console.log('MONGO_URI loaded:', Boolean(process.env.MONGODB_URI))
connectToDb()

//Error-Handling Middleware
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)
    if (err?.name === "ValidationError") {
        const details = Object.values(err.errors || {}).map((item) => ({ field: item.path, message: item.message }))
        return res.status(400).json({success: false, message: "Request validation failed", errors: details})
    }
    if (err?.name === "CastError") {
        return res.status(400).json({success: false, message: "Invalid value", field: err.path})
    }
    if (err?.code === 11000) {
        return res.status(409).json({success: false, message: "A record with this unique value already exists"})
    }
    const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500
    if (statusCode >= 500) {
        console.error(err.stack)
        return res.status(500).send('Something went wrong!')
    }
    return res.status(statusCode).json({success: false, message: err.message, ...(err.details ? {details: err.details} : {})})
})
