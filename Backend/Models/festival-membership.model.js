import {Schema, model, Types} from 'mongoose'

const festivalMembershipSchema = new Schema({
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
    membershipType: {
        type: String,
        enum: ['attendee', 'volunteer', 'organizer'],
        required: true,
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'pending'],
        default: 'pending',
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const FestivalMembershipModel = model('FestivalMembership', festivalMembershipSchema)