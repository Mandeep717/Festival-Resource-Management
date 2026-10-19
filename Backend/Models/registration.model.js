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

export const RegistrationModel = model('Registration', registrationSchema);
