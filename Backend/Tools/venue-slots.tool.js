import { Types } from "mongoose";
import { tool } from "langchain";
import * as z from "zod";

import { FestivalModel } from "../Models/festival.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { VenueModel } from "../Models/venue.model.js";

const SLOT_INTERVAL_MS = 30 * 60 * 1000;
const MAX_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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
    // Adjacent sessions are allowed: [start, end).
    return startA < endB && startB < endA;
}

export function createVenueSlotsTool({
    festivalId,
    scheduleVersionId,
    targetSessionId,
    windowStart,
    windowEnd,
}) {
    if (
        !Types.ObjectId.isValid(festivalId) ||
        !Types.ObjectId.isValid(scheduleVersionId) ||
        !Types.ObjectId.isValid(targetSessionId)
    ) {
        throw new Error("Invalid festival or schedule version ID");
    }

    const searchStart = parseDate(windowStart, "windowStart");
    const searchEnd = parseDate(windowEnd, "windowEnd");
    if (searchStart >= searchEnd) {
        throw new Error("windowEnd must be after windowStart");
    }
    if (searchEnd.getTime() - searchStart.getTime() > MAX_WINDOW_MS) {
        throw new Error("Venue search window cannot exceed seven days");
    }

    return tool(
        async ({ sessionId }) => {
            if (!Types.ObjectId.isValid(sessionId)) {
                fail(400, "Invalid session ID");
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
                    .select("title maxParticipants")
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
            if (
                !Number.isFinite(durationMs) ||
                durationMs <= 0
            ) {
                fail(409, "Session has an invalid scheduled duration");
            }

            const festivalStart = new Date(festival.startDate);
            const festivalEnd = new Date(festival.endDate);
            if (
                searchStart < festivalStart ||
                searchEnd > festivalEnd
            ) {
                fail(400, "Search window must be within the festival dates");
            }

            const requiredCapacity = Math.max(
                Number(currentEntry.capacity || 0),
                Number(session.maxParticipants || 0)
            );
            const venues = await VenueModel.find({
                festivalId,
                status: "active",
                capacity: { $gte: requiredCapacity },
            })
                .select("_id name capacity")
                .lean();

            const otherEntries = (schedule.scheduleSnapshot || []).filter(
                (entry) => String(entry.sessionId) !== String(sessionId)
            );
            const candidates = [];
            let candidateMs =
                Math.ceil(searchStart.getTime() / SLOT_INTERVAL_MS) *
                SLOT_INTERVAL_MS;

            while (
                candidateMs + durationMs <= searchEnd.getTime() &&
                candidateMs + durationMs <= festivalEnd.getTime() &&
                candidates.length < 5
            ) {
                const candidateStart = new Date(candidateMs);
                const candidateEnd = new Date(candidateMs + durationMs);

                for (const venue of venues) {
                    const occupied = otherEntries.some(
                        (entry) =>
                            String(entry.venueId) === String(venue._id) &&
                            overlaps(
                                candidateStart,
                                candidateEnd,
                                new Date(entry.startTime),
                                new Date(entry.endTime)
                            )
                    );

                    if (!occupied) {
                        candidates.push({
                            startTime: candidateStart.toISOString(),
                            endTime: candidateEnd.toISOString(),
                            venueId: String(venue._id),
                            venueName: venue.name,
                            venueCapacity: venue.capacity,
                        });
                        if (candidates.length >= 5) break;
                    }
                }

                candidateMs += SLOT_INTERVAL_MS;
            }

            return JSON.stringify({
                sessionId: String(session._id),
                scheduleVersionId: String(schedule._id),
                scheduleStatus: schedule.status,
                candidates,
                checked: [
                    "active venue",
                    "venue capacity",
                    "venue overlap in the selected schedule",
                ],
                note:
                    "Setup and teardown buffers are not checked because they are not stored in the current models.",
            });
        },
        {
            name: "find_venue_slots",
            description:
                "Find up to five possible slots within the supplied festival time window. Return only active venues with enough capacity and no overlapping session in the selected schedule. Use check_staff_and_equipment before recommending a candidate.",
            schema: z.object({
                sessionId: z.string(),
            }),
        }
    );
}
