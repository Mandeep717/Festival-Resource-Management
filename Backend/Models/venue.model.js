import {Schema, model, Types} from 'mongoose';

const venueSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    address: {
        type: String,
        required: true,
    },
    capacity: {
        type: Number,
        required: true,
        min: 0,
    },
    description: {
        type: String,
        required: true,
    },
    festivalId: {
        type: Types.ObjectId,
        ref: 'Festival',
        required: true,
    },
    venueCode: {
        type: String,
        required: true,
        unique: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'under_maintenance'],
        default: 'active',
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

venueSchema.index(
    { festivalId: 1, venueCode: 1 },
    { unique: true }
);

export const VenueModel = model('Venue', venueSchema);