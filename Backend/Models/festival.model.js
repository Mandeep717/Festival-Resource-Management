import {Schema, model, Types} from 'mongoose'

const festivalSchema = new Schema({
    name: {
        type: String,
        required: true,
    },
    slug: {
        type: String,
        required: true,
        unique: true,
    },
    description: {
        type: String,
        required: true,
    },
    organizerId: {
        type: Types.ObjectId,
        ref: 'User',
        required: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
        validate: {
            validator: function (v) {
                return v >= this.startDate;
            },
            message: 'End date must be after start date',
        },
    },
    location: {
        type: String,
        required: true,
    },
    status: {
        type: String,
        enum: ['upcoming', 'ongoing', 'completed', 'cancelled'],
        default: 'upcoming',
    },
    registrationDeadline: {
        type: Date,
        required: true,
        validate: {
            validator: function (v) {
                return v < this.startDate;
            },
            message: 'Registration deadline must be before start date',
        },
    },
    registrationFee: {
        type: Number,
        required: true,
        min: 0,
    },
    registrationStartDate: {
        type: Date,
        required: true,
        validate: {
            validator: function (v) {
                return v < this.registrationDeadline;
            },
            message: 'Registration start date must be before registration deadline',
        },
    },
    publishedScheduleId: {
        type: Types.ObjectId,
        ref: 'ScheduleVersion',
        default: null,
    }
},{
    timestamps: true,
    versionKey: false,
    strict: "throw"
})

export const FestivalModel = model('Festival', festivalSchema)