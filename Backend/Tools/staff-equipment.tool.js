import { Types } from "mongoose";
import { tool } from "langchain";
import * as z from "zod";

import { FestivalModel } from "../Models/festival.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { VenueModel } from "../Models/venue.model.js";
import { ResourceModel } from "../Models/resource.model.js";
import { ShiftModel } from "../Models/shift.model.js";
import { FestivalMembershipModel } from "../Models/festival-membership.model.js";

function fail(statusCode, message) {
    const error = new Error(message);
    error.statusCode = statusCode;
    throw error;
}

function parseDate(value, fieldName) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        fail(400, `${fieldName} must be a valid date`);
    }
    return date;
}

function overlaps(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
}

function peakConcurrentDemand({
    resourceId,
    candidateStart,
    candidateEnd,
    candidateQuantity,
    otherEntries,
}) {
    const candidateStartMs = candidateStart.getTime();
    const candidateEndMs = candidateEnd.getTime();
    const events = [
        { time: candidateStartMs, delta: candidateQuantity },
        { time: candidateEndMs, delta: -candidateQuantity },
    ];

    for (const entry of otherEntries) {
        const entryStart = new Date(entry.startTime).getTime();
        const entryEnd = new Date(entry.endTime).getTime();

        if (
            !Number.isFinite(entryStart) ||
            !Number.isFinite(entryEnd) ||
            !overlaps(
                candidateStartMs,
                candidateEndMs,
                entryStart,
                entryEnd
            )
        ) {
            continue;
        }

        const quantity = (entry.resourcesAllocated || [])
            .filter(
                (allocation) =>
                    String(allocation.resourceId) === String(resourceId)
            )
            .reduce(
                (total, allocation) =>
                    total + Number(allocation.quantity || 0),
                0
            );

        if (quantity <= 0) continue;

        events.push({
            time: Math.max(candidateStartMs, entryStart),
            delta: quantity,
        });
        events.push({
            time: Math.min(candidateEndMs, entryEnd),
            delta: -quantity,
        });
    }

    // End events precede start events at equal timestamps.
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);

    let demand = 0;
    let peak = 0;
    for (const event of events) {
        demand += event.delta;
        peak = Math.max(peak, demand);
    }
    return peak;
}

export function createStaffAndEquipmentTool({
    festivalId,
    scheduleVersionId,
    targetSessionId,
}) {
    if (
        !Types.ObjectId.isValid(festivalId) ||
        !Types.ObjectId.isValid(scheduleVersionId) ||
        !Types.ObjectId.isValid(targetSessionId)
    ) {
        throw new Error("Invalid festival or schedule version ID");
    }

    return tool(
        async ({ sessionId, candidateStart, candidateVenueId }) => {
            if (
                !Types.ObjectId.isValid(sessionId) ||
                !Types.ObjectId.isValid(candidateVenueId)
            ) {
                fail(400, "Invalid session or candidate venue ID");
            }
            if (String(sessionId) !== String(targetSessionId)) {
                fail(403, "Tool can only inspect the requested session");
            }

            const [festival, schedule, session] = await Promise.all([
                FestivalModel.findById(festivalId)
                    .select("startDate endDate")
                    .lean(),
                ScheduleVersionModel.findOne({
                    _id: scheduleVersionId,
                    festivalId,
                    status: { $in: ["draft", "published"] },
                })
                    .select("scheduleSnapshot status")
                    .lean(),
                FestivalSessionModel.findOne({
                    _id: sessionId,
                    festivalId,
                    proposalStatus: "approved",
                    status: { $ne: "cancelled" },
                })
                    .select(
                        "title resourcesRequired volunteersAssigned maxParticipants"
                    )
                    .lean(),
            ]);

            if (!festival) fail(404, "Festival not found");
            if (!schedule) fail(404, "Schedule version not found");
            if (!session) fail(404, "Approved session not found");

            const currentEntry = (schedule.scheduleSnapshot || []).find(
                (entry) => String(entry.sessionId) === String(sessionId)
            );
            if (!currentEntry) {
                fail(404, "Session is not in this schedule version");
            }

            const currentStart = new Date(currentEntry.startTime);
            const currentEnd = new Date(currentEntry.endTime);
            const durationMs = currentEnd.getTime() - currentStart.getTime();
            if (!Number.isFinite(durationMs) || durationMs <= 0) {
                fail(409, "Session has an invalid scheduled duration");
            }

            const startTime = parseDate(candidateStart, "candidateStart");
            const endTime = new Date(startTime.getTime() + durationMs);
            const festivalStart = new Date(festival.startDate);
            const festivalEnd = new Date(festival.endDate);
            if (startTime < festivalStart || endTime > festivalEnd) {
                fail(400, "Candidate time must be within the festival dates");
            }

            const otherEntries = (schedule.scheduleSnapshot || []).filter(
                (entry) => String(entry.sessionId) !== String(sessionId)
            );
            const conflicts = [];

            // Recheck the venue in case the schedule changed after slot search.
            const venue = await VenueModel.findOne({
                _id: candidateVenueId,
                festivalId,
                status: "active",
            })
                .select("_id name capacity")
                .lean();

            if (!venue) {
                conflicts.push({
                    type: "venue",
                    message: "Candidate venue is missing or inactive.",
                });
            } else {
                const capacityNeeded = Math.max(
                    Number(currentEntry.capacity || 0),
                    Number(session.maxParticipants || 0)
                );
                if (venue.capacity < capacityNeeded) {
                    conflicts.push({
                        type: "venue",
                        message: "Candidate venue capacity is too small.",
                    });
                }

                const overlappingVenueEntry = otherEntries.find(
                    (entry) =>
                        String(entry.venueId) === String(candidateVenueId) &&
                        overlaps(
                            startTime,
                            endTime,
                            new Date(entry.startTime),
                            new Date(entry.endTime)
                        )
                );
                if (overlappingVenueEntry) {
                    conflicts.push({
                        type: "venue",
                        conflictingSessionId: String(
                            overlappingVenueEntry.sessionId
                        ),
                        message: "Another session overlaps in this venue.",
                    });
                }
            }

            const allocationQuantities = new Map();
            for (const allocation of currentEntry.resourcesAllocated || []) {
                const resourceId = String(allocation.resourceId);
                const quantity = Number(allocation.quantity);
                if (!Number.isInteger(quantity) || quantity < 1) {
                    conflicts.push({
                        type: "equipment",
                        resourceId,
                        message: "An allocated resource has an invalid quantity.",
                    });
                    continue;
                }
                allocationQuantities.set(
                    resourceId,
                    (allocationQuantities.get(resourceId) || 0) + quantity
                );
            }

            const requiredResourceIds = (session.resourcesRequired || []).map(
                String
            );
            for (const resourceId of requiredResourceIds) {
                if (!allocationQuantities.has(resourceId)) {
                    conflicts.push({
                        type: "equipment",
                        resourceId,
                        message:
                            "A required resource is not allocated in this schedule version.",
                    });
                }
            }

            const resourceIds = [
                ...new Set([
                    ...requiredResourceIds,
                    ...allocationQuantities.keys(),
                ]),
            ];
            const resources = resourceIds.length
                ? await ResourceModel.find({
                    _id: { $in: resourceIds },
                    festivalId,
                })
                    .select("_id name quantity availabilityStatus")
                    .lean()
                : [];
            const resourcesById = new Map(
                resources.map((resource) => [String(resource._id), resource])
            );

            for (const [resourceId, candidateQuantity] of allocationQuantities) {
                const resource = resourcesById.get(resourceId);
                if (!resource) {
                    conflicts.push({
                        type: "equipment",
                        resourceId,
                        message:
                            "Resource is missing or does not belong to this festival.",
                    });
                    continue;
                }

                if (resource.availabilityStatus !== "available") {
                    conflicts.push({
                        type: "equipment",
                        resourceId,
                        message: `Resource "${resource.name}" is ${resource.availabilityStatus}.`,
                    });
                }

                const peakDemand = peakConcurrentDemand({
                    resourceId,
                    candidateStart: startTime,
                    candidateEnd: endTime,
                    candidateQuantity,
                    otherEntries,
                });
                if (peakDemand > resource.quantity) {
                    conflicts.push({
                        type: "equipment",
                        resourceId,
                        message: `Peak overlapping demand for "${resource.name}" is ${peakDemand}; inventory is ${resource.quantity}.`,
                    });
                }
            }

            const volunteers = (
                Array.isArray(currentEntry.volunteersAssigned)
                    ? currentEntry.volunteersAssigned
                    : session.volunteersAssigned || []
            ).map(String);
            const reportedVolunteerConflicts = new Set();

            function addVolunteerConflict(volunteerId, conflictingSessionId) {
                const key = `${volunteerId}:${conflictingSessionId}`;
                if (reportedVolunteerConflicts.has(key)) return;
                reportedVolunteerConflicts.add(key);
                conflicts.push({
                    type: "staff",
                    volunteerId,
                    conflictingSessionId,
                    message:
                        "An assigned volunteer has an overlapping session or shift that needs review.",
                });
            }

            if (volunteers.length) {
                const activeMemberships = await FestivalMembershipModel.find({
                    festivalId,
                    userId: { $in: volunteers },
                    membershipType: "volunteer",
                    status: "active",
                })
                    .select("userId")
                    .lean();
                const activeVolunteerIds = new Set(
                    activeMemberships.map((membership) =>
                        String(membership.userId)
                    )
                );

                for (const volunteerId of volunteers) {
                    if (!activeVolunteerIds.has(volunteerId)) {
                        conflicts.push({
                            type: "staff",
                            volunteerId,
                            message:
                                "Assigned user is not an active volunteer in this festival.",
                        });
                    }
                }

                for (const entry of otherEntries) {
                    if (
                        !overlaps(
                            startTime,
                            endTime,
                            new Date(entry.startTime),
                            new Date(entry.endTime)
                        )
                    ) {
                        continue;
                    }
                    for (const assignedId of entry.volunteersAssigned || []) {
                        const volunteerId = String(assignedId);
                        if (volunteers.includes(volunteerId)) {
                            addVolunteerConflict(
                                volunteerId,
                                String(entry.sessionId)
                            );
                        }
                    }
                }

                const overlappingShifts = await ShiftModel.find({
                    festivalId,
                    sessionId: { $ne: sessionId },
                    status: { $in: ["scheduled", "ongoing"] },
                    volunteers: { $in: volunteers },
                    startTime: { $lt: endTime },
                    endTime: { $gt: startTime },
                })
                    .select("sessionId volunteers")
                    .lean();

                for (const shift of overlappingShifts) {
                    for (const assignedId of shift.volunteers || []) {
                        const volunteerId = String(assignedId);
                        if (volunteers.includes(volunteerId)) {
                            addVolunteerConflict(
                                volunteerId,
                                String(shift.sessionId)
                            );
                        }
                    }
                }
            }

            return JSON.stringify({
                sessionId: String(session._id),
                scheduleVersionId: String(schedule._id),
                candidate: {
                    startTime: startTime.toISOString(),
                    endTime: endTime.toISOString(),
                    venueId: String(candidateVenueId),
                    venueName: venue?.name || null,
                },
                feasible: conflicts.length === 0,
                conflicts,
                note:
                    "Read-only check. It does not move the session or change resource, volunteer, or schedule records.",
            });
        },
        {
            name: "check_staff_and_equipment",
            description:
                "Check a candidate start time and venue for room conflicts, equipment availability and overlapping quantity demand, and volunteer membership or overlapping sessions and shifts. Call before recommending the candidate.",
            schema: z.object({
                sessionId: z.string(),
                candidateStart: z.string(),
                candidateVenueId: z.string(),
            }),
        }
    );
}
