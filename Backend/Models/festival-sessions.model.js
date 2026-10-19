import { Schema, model, Types } from 'mongoose';

const festivalSessionSchema = new Schema({
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    sessionType: {
        type: String,
        enum: ['workshop', 'talk', 'hackathon', 'contest', 'cultural', 'other'],
        required: true,
    },
    startTime: {
        type: Date,
        required: true,
    },
    endTime: {
        type: Date,
        required: true,
        validate: {
            validator: function (v) {
                return v > this.startTime;
            },
            message: 'End time must be after start time',
        },
    },
    venueId: {
        type: Types.ObjectId,
        ref: 'Venue',
        required: true,
    },
    status: {
        type: String,
        enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
        default: 'scheduled',
    },
    proposalStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'approved',
        index: true,
    },
    proposedBy: {
        type: Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reviewedBy: {
        type: Types.ObjectId,
        ref: 'User',
        default: null,
    },
    reviewedAt: {
        type: Date,
        default: null,
    },
    reviewNote: {
        type: String,
        default: '',
        trim: true,
    },
    resourcesRequired: {
        type: [Types.ObjectId],
        ref: 'Resource',
        default: [],
    },
    volunteersAssigned: {
        type: [Types.ObjectId],
        ref: 'User',
        default: [],
    },
    maxParticipants: {
        type: Number,
        default: null,
    },
    registrationDeadline: {
        type: Date,
        default: null,
        validate: {
            validator: function (v) {
                return v === null || v < this.startTime;
            },
            message: 'Registration deadline must be before session start time',
        },
    },
    registrationFee: {
        type: Number,
        default: 0,
        min: 0,
    },
    registrationStartDate: {
        type: Date,
        default: null,
        validate: {
            validator: function (v) {
                return v === null || v < this.registrationDeadline;
            },
            message: 'Registration start date must be before registration deadline',
        },
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const FestivalSessionModel = model('FestivalSession', festivalSessionSchema)
