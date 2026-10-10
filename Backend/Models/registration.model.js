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
        required: true,
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending',
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

export const RegistrationModel = model('Registration', registrationSchema);