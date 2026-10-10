import { Schema, model, Types } from 'mongoose'

const waitlistSchema = new Schema({
    userId: {
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    },
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    sessionId: {
        type: Types.ObjectId,
        ref: 'FestivalSession',
        required: true,
    },
    position: {
        type: Number,
        required: true,
        min: 1,
    },
    status: {
        type: String,
        enum: ['waiting', 'notified', 'removed'],
        default: 'waiting',
    },
    registrationId: {
        type: Types.ObjectId,
        ref: 'Registration',
        default: null,
    },
    joinedAt: {
        type: Date,
        default: Date.now,
    },
    cancelledAt: {
        type: Date,
        default: null,
    },
    promotedAt: {
        type: Date,
        default: null,
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const WaitlistModel = model('Waitlist', waitlistSchema)