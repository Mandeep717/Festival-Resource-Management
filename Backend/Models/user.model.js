import {Schema, model} from 'mongoose';

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    accountType: {
        type: String,
        enum: ['attendee', 'organizer', 'volunteer'],
    },
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
