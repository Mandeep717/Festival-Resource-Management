import { Schema, model, Types } from 'mongoose';

const registrationSchema = new Schema({
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
        // required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending',
    },
    attendanceStatus: {
        type: String,
        enum: ['not_marked', 'checked_in', 'no_show'],
        default: 'not_marked',
    },
    checkedInAt: {
        type: Date,
        default: null,
    },
    checkedInBy: {
        type: Types.ObjectId,
        ref: 'User',
        default: null,
    },
    registeredAt: {
        type: Date,
        default: Date.now,
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

registrationSchema.index(
    { festivalId: 1, userId: 1, sessionId: 1 },
    { unique: true }
);
registrationSchema.index({ festivalId: 1, sessionId: 1, status: 1, registeredAt: 1 });
registrationSchema.index({ userId: 1, registeredAt: -1 });

export const RegistrationModel = model('Registration', registrationSchema);
