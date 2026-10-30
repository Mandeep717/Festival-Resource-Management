import {Schema, model} from 'mongoose';

const userSchema = new Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        maxlength: 254,
        match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'A valid email address is required'],
    },
    password: {
        type: String,
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100,
    },
    accountType: {
        type: String,
        enum: ['attendee', 'organizer', 'volunteer', 'admin'],
        required: true,
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
