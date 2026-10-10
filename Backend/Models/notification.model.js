import { Schema, model, Types } from 'mongoose'

const notificationSchema = new Schema({
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
    message: {
        type: String,
        required: true,
    },
    sessionId: {
        type: Types.ObjectId,
        ref: 'FestivalSession',
        required: false,
    },
    shiftId: {
        type: Types.ObjectId,
        ref: 'Shift',
        required: false,
    },
    read: {
        type: Boolean,
        default: false,
    },
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const NotificationModel = model('Notification', notificationSchema)