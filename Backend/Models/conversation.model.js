import { Schema, model, Types } from 'mongoose';

const messageSchema = new Schema({
    role: {
        type: String,
        enum: ['user', 'assistant', 'system'],
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

const conversationSchema = new Schema({
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    userId: {
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    },
    messages: {
        type: [messageSchema],
        default: [],
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const ConversationModel = model('Conversation', conversationSchema);