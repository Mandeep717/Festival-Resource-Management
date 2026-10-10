import { Schema, model, Types } from 'mongoose'

const chunkSchema = new Schema({
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    documentId: {
        type: Types.ObjectId,
        ref: 'Document',
        required: true,
    },
    chunkIndex: {
        type: Number,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
    embedding: {
        type: [Number],
        required: true,
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

export const ChunkModel = model('Chunk', chunkSchema)