import {Schema, model, Types} from 'mongoose'

const resourceSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    description: {
        type: String,
        required: true,
    },
    resourceType: {
        type: String,
        enum: ['projector', 'microphone', 'speaker', 'monitor', 'camera', 'other'],
        required: true,
    },
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    availabilityStatus: {
        type: String,
        enum: ['available', 'unavailable', 'reserved'],
        default: 'available',
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const ResourceModel = model('Resource', resourceSchema)