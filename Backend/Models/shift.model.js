import { Schema, model, Types } from 'mongoose';

const shiftSchema = new Schema({
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    volunteers: {
        type: [Types.ObjectId],
        ref: 'User',
        required: true,
    },
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
    status: {
        type: String,
        enum: ['scheduled', 'ongoing', 'completed', 'cancelled'],
        default: 'scheduled',
    },
    notes: {
        type: String,
        default: '',
    },

},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const ShiftModel = model('Shift', shiftSchema);
