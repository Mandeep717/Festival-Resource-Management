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
        validate: { validator: Number.isInteger, message: 'Waitlist position must be a whole number' },
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

waitlistSchema.index(
    { festivalId: 1, sessionId: 1, userId: 1 },
    { unique: true, partialFilterExpression: { status: 'waiting' } }
)
waitlistSchema.index({ festivalId: 1, sessionId: 1, status: 1, position: 1, joinedAt: 1 })

export const WaitListModel = model('Waitlist', waitlistSchema)
