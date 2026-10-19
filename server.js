import exp from 'express'
import {connect} from 'mongoose'
import cookieParser from "cookie-parser";
import dotenv from 'dotenv'

const app = exp()
dotenv.config()
const PORT = process.env.PORT || 3000
//Body-Parser Middleware
app.use(exp.json())
app.use(cookieParser())

import { publicRouter } from './Backend/APIs/public.api.js'
import { volunteerRouter } from './Backend/APIs/volunteer.api.js'
import { attendeeRouter } from './Backend/APIs/attendee.api.js'
import { organizerRouter } from './Backend/APIs/organizer.api.js'

app.use('/api', publicRouter)
app.use('/api/volunteer', volunteerRouter)
app.use('/api/attendee', attendeeRouter)
app.use('/api/organizer', organizerRouter)

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
    const statusCode = Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600
        ? err.statusCode
        : 500
    if (statusCode >= 500) {
        console.error(err.stack)
        return res.status(500).send('Something went wrong!')
    }
    return res.status(statusCode).json({success: false, message: err.message})
})
