// Backend/Services/read-session-needs.tool.js
import { Types } from "mongoose";
import { tool } from "langchain";
import * as z from "zod";

import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { VenueModel } from "../Models/venue.model.js";
import { ResourceModel } from "../Models/resource.model.js";

export function createReadSessionNeedsTool({
    festivalId,
    scheduleVersionId,
    targetSessionId,
}) {
    return tool(
        async ({ sessionId }) => {
            if (
                !Types.ObjectId.isValid(festivalId) ||
                !Types.ObjectId.isValid(scheduleVersionId) ||
                !Types.ObjectId.isValid(sessionId) ||
                !Types.ObjectId.isValid(targetSessionId)
            ) {
                throw new Error("Invalid festival, schedule, or session ID");
            }
            if (String(sessionId) !== String(targetSessionId)) {
                throw new Error("Tool can only inspect the requested session");
            }

            const [session, schedule] = await Promise.all([
                FestivalSessionModel.findOne({
                    _id: sessionId,
                    festivalId,
                    proposalStatus: "approved",
                    status: { $ne: "cancelled" },
                })
                    .select(
                        "title startTime endTime resourcesRequired volunteersAssigned maxParticipants"
                    )
                    .lean(),

                ScheduleVersionModel.findOne({
                    _id: scheduleVersionId,
                    festivalId,
                    status: { $in: ["draft", "published"] },
                })
                    .select("scheduleSnapshot status version")
                    .lean(),
            ]);

            if (!session) {
                throw new Error("Approved session not found for this festival");
            }
            if (!schedule) {
                throw new Error("Schedule version not found for this festival");
            }

            const scheduleEntry = (schedule.scheduleSnapshot || []).find(
                (entry) => String(entry.sessionId) === String(sessionId)
            );

            if (!scheduleEntry) {
                throw new Error("Session is not in this schedule version");
            }

            const requiredIds = (session.resourcesRequired || []).map(String);
            const allocations = scheduleEntry.resourcesAllocated || [];
            const allocatedIds = allocations.map((item) =>
                String(item.resourceId)
            );
            const resourceIds = [
                ...new Set([...requiredIds, ...allocatedIds]),
            ];

            const [resources, venue] = await Promise.all([
                resourceIds.length
                    ? ResourceModel.find({
                          _id: { $in: resourceIds },
                          festivalId,
                      })
                          .select(
                              "_id name resourceType quantity availabilityStatus"
                          )
                          .lean()
                    : [],
                VenueModel.findOne({
                    _id: scheduleEntry.venueId,
                    festivalId,
                })
                    .select("_id name capacity status")
                    .lean(),
            ]);

            const resourcesById = new Map(
                resources.map((resource) => [
                    String(resource._id),
                    resource,
                ])
            );

            const assignedVolunteers = Array.isArray(
                scheduleEntry.volunteersAssigned
            )
                ? scheduleEntry.volunteersAssigned
                : session.volunteersAssigned || [];

            return JSON.stringify({
                sessionId: String(session._id),
                title: session.title,
                startTime: scheduleEntry.startTime,
                endTime: scheduleEntry.endTime,
                durationMinutes: Math.round(
                    (new Date(scheduleEntry.endTime) -
                        new Date(scheduleEntry.startTime)) /
                        60000
                ),
                venue,
                capacity: scheduleEntry.capacity,
                maxParticipants: session.maxParticipants,
                requiredResources: requiredIds.map((resourceId) => ({
                    resourceId,
                    resource: resourcesById.get(resourceId) || null,
                    requestedQuantity: null,
                })),
                allocatedResources: allocations.map((allocation) => ({
                    resourceId: String(allocation.resourceId),
                    quantity: allocation.quantity,
                    resource:
                        resourcesById.get(String(allocation.resourceId)) ||
                        null,
                })),
                assignedVolunteerIds: assignedVolunteers.map(String),
                scheduleVersionId: String(schedule._id),
                scheduleStatus: schedule.status,
            });
        },
        {
            name: "read_session_needs",
            description:
                "Read an approved session's current schedule entry, requirements, resource allocations, venue, and assigned volunteers.",
            schema: z.object({
                sessionId: z.string(),
            }),
        }
    );
}
