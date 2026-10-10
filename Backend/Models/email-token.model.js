import { Schema, model, Types } from 'mongoose';

const emailTokenSchema = new Schema(
    {
        userId: {
            type: Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },

        tokenHash: {
            type: String,
            required: true,
            unique: true
        },

        tokenType: {
            type: String,
            enum: [
                'EMAIL_VERIFICATION',
                'PASSWORD_RESET'
            ],
            required: true
        },

        expiresAt: {
            type: Date,
            required: true
        },

        consumedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true,
        versionKey: false,
        strict: 'throw'
    }
);

export const EmailTokenModel = model(
    'EmailToken',
    emailTokenSchema
);