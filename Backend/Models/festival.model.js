import {Schema, model, Types} from 'mongoose'

const festivalSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    organizerId: {
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    location: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
        default: 'upcoming',
    },
    registrationDeadline: {
        type: Date,
        required: true,
    },
    registrationFee: {
        type: Number,
        required: true,
        min: 0,
    },
    registrationStartDate: {
        type: Date,
        required: true,
    },
    publishedScheduleId: {
        type: Types.ObjectId,
        ref: 'Schedule',
        default: null,
    },
    volunteers: {
        type: [Types.ObjectId],
        ref: 'User',
        default: [],
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const FestivalModel = model('Festival', festivalSchema)