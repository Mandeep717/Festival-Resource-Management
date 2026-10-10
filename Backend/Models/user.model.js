import {Schema, model} from 'mongoose';

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    // role: {
    //     type: String,
    //     enum: ['attendee', 'organizer', 'volunteer', 'admin'],
    //     required: true,
    //     default: 'attendee'
    // },
    status: {
        type: String,
        enum: ['active', 'disabled', 'pending'],
        default: 'active'
    },
    lastLogIn: {
        type: Date,
        default: null
    },
    emailVerifiedAt: {
        type: Date,
        default: null
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const UserModel = model('User', userSchema);