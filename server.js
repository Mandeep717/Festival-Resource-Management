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

function connectToDb(){
    try{
        connect(process.env.MONGO_URI)
        console.log("Connected to MongoDB")
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`)
        })
    } catch (error) {
        console.error("Error connecting to MongoDB", error)
    }
}

connectToDb()

//Error-Handling Middleware
app.use((err, req, res, next) => {
    console.error(err.stack)
    res.status(500).send('Something went wrong!')
})