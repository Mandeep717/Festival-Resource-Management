import { Schema, model, Types } from 'mongoose'

const scheduleSnapshotSchema = new Schema({
    sessionId: {
        type: Types.ObjectId,
        ref: 'FestivalSession',
        required: true,
    },
    venueId: {
        type: Types.ObjectId,
        ref: 'Venue',
        required: true,
    },
    resourcesAllocated: {
        type: [Types.ObjectId],
        ref: 'Resource',
        default: [],
    },
    capacity: {
        type: Number,
        required: true,
        min: 0,
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

const conflictDetailsSchema = new Schema({
    conflictType: {
        type: String,
        enum: ['resource', 'venue', 'time'],
        required: true,
    },
    conflictDescription: {
        type: String,
        default: null,
    },
    resolved: {
        type: Boolean,
        default: false,
    },
    sessionIds: {
        type: [Types.ObjectId],
        ref: 'FestivalSession',
        default: [],
    },
    venueIds: {
        type: [Types.ObjectId],
        ref: 'Venue',
        default: [],
    },
    resourcesAllocated: {
        type: [Types.ObjectId],
        ref: 'Resource',
        default: [],
    },
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

const scheduleVersionSchema = new Schema({
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    version: {
        type: Number,
        required: true,
        min: 1,
    },
    baseVersionId: {
        type: Types.ObjectId,
        ref: 'ScheduleVersion',
        default: null,
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
    },
    createdBy: {
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    },
    conflictDetails: {
        type: [conflictDetailsSchema],
        default: [],
    },
    scheduleSnapshot: {
        type: [scheduleSnapshotSchema],
        default: [],
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const ScheduleVersionModel = model('ScheduleVersion', scheduleVersionSchema)