import { Schema, model, Types } from 'mongoose';

const documentSchema = new Schema({
    title: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    author: {
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    },
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    documentType: {
        type: String,
        enum: ['policy', 'guideline', 'announcement', 'schedule', 'other'],
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    visibility: {
        type: String,
        enum: ['public', 'staff', 'organizer'],
        default: 'staff',
        required: true,
    },
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const DocumentModel = model('Document', documentSchema);