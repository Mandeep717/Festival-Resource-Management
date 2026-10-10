import { Schema, model, Types } from 'mongoose';

const incidentSchema = new Schema(
    {
        festivalId: {
            type: Types.ObjectId,
            ref: 'Festival',
            required: true,
            index: true
        },

        reportedBy: {
            type: Types.ObjectId,
            ref: 'User',
            required: true
        },

        sessionId: {
            type: Types.ObjectId,
            ref: 'FestivalSession',
            default: null
        },

        venueId: {
            type: Types.ObjectId,
            ref: 'Venue',
            default: null
        },

        resourceId: {
            type: Types.ObjectId,
            ref: 'Resource',
            default: null
        },

        title: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            required: true,
            trim: true
        },

        category: {
            type: String,
            enum: [
                'EQUIPMENT',
                'VENUE',
                'SAFETY',
                'STAFFING',
                'OTHER'
            ],
            required: true
        },

        severity: {
            type: String,
            enum: [
                'LOW',
                'MEDIUM',
                'HIGH',
                'CRITICAL'
            ],
            required: true
        },

        status: {
            type: String,
            enum: [
                'OPEN',
                'IN_PROGRESS',
                'RESOLVED',
                'CLOSED'
            ],
            default: 'OPEN'
        },

        assignedTo: {
            type: Types.ObjectId,
            ref: 'User',
            default: null
        },

        resolutionNotes: {
            type: String,
            default: ''
        },

        resolvedBy: {
            type: Types.ObjectId,
            ref: 'User',
            default: null
        },

        resolvedAt: {
            type: Date,
            default: null
        },

        visibility: {
            type: String,
            enum: [
                'ASSIGNED_TEAM',
                'STAFF',
                'ORGANIZERS'
            ],
            default: 'STAFF'
        }
    },
    {
        timestamps: true
    }
);

export const IncidentModel = model(
    'Incident',
    incidentSchema
);