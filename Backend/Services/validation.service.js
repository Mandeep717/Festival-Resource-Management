import { Types } from "mongoose";
import { ScheduleVersionModel } from "../Models/schedule-version.model.js";
import { FestivalSessionModel } from "../Models/festival-sessions.model.js";
import { VenueModel } from "../Models/venue.model.js";
import { ResourceModel } from "../Models/resource.model.js";

export class ScheduleValidationError extends Error {
  constructor(statusCode, message, details = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

function overlaps(startA, endA, startB, endB) {
  // Adjacent sessions are allowed: [start, end)
  return startA < endB && startB < endA;
}

function makeConflict(
  conflictType,
  conflictDescription,
  sessionIds = [],
  venueIds = [],
  resourcesAllocated = []
) {
  return {
    conflictType,
    conflictDescription,
    resolved: false,
    sessionIds: [...new Set(sessionIds.map(String))],
    venueIds: [...new Set(venueIds.map(String))],
    resourcesAllocated,
  };
}

function calculateConflicts(snapshot, sessionsById, venuesById, resourcesById) {
  const conflicts = [];
  const conflictKeys = new Set();

  function addConflict(conflict) {
    const key = [
      conflict.conflictType,
      [...conflict.sessionIds].sort().join(","),
      [...conflict.venueIds].sort().join(","),
      conflict.resourcesAllocated
        .map(({ resourceId }) => String(resourceId))
        .sort()
        .join(","),
      conflict.conflictDescription,
    ].join("|");

    if (!conflictKeys.has(key)) {
      conflictKeys.add(key);
      conflicts.push(conflict);
    }
  }

  const entries = snapshot.map((entry, index) => {
    const start = new Date(entry.startTime).getTime();
    const end = new Date(entry.endTime).getTime();

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new ScheduleValidationError(
        422,
        "Schedule snapshot contains an invalid time range.",
        {
          validationErrors: [{
            entryIndex: index,
            message: "Start and end times must be valid, and end must be after start.",
          }],
        }
      );
    }

    const sessionId = String(entry.sessionId);
    const venueId = String(entry.venueId);
    const session = sessionsById.get(sessionId);
    const venue = venuesById.get(venueId);

    if (!session || !venue) {
      throw new ScheduleValidationError(
        422,
        "Schedule snapshot contains a missing or cross-festival reference.",
        {
          validationErrors: [{
            entryIndex: index,
            message: "Session and venue must exist and belong to this festival.",
          }],
        }
      );
    }

    const proposalStatus = session.proposalStatus || "approved";
    if (proposalStatus !== "approved") {
      throw new ScheduleValidationError(
        409,
        "A schedule can include only approved session proposals.",
        {
          unapprovedSessions: [{
            sessionId,
            proposalStatus,
          }],
        }
      );
    }

    return { entry, index, start, end, sessionId, venueId, session, venue };
  });

  // Each session should appear once in a schedule version.
  const sessionCounts = new Map();
  for (const item of entries) {
    sessionCounts.set(item.sessionId, (sessionCounts.get(item.sessionId) || 0) + 1);
  }

  const duplicatedSessions = [...sessionCounts]
    .filter(([, count]) => count > 1)
    .map(([sessionId]) => sessionId);

  if (duplicatedSessions.length > 0) {
    throw new ScheduleValidationError(
      422,
      "A session appears more than once in the schedule snapshot.",
      { duplicatedSessions }
    );
  }

  // Venue status and capacity checks.
  for (const item of entries) {
    if (item.venue.status !== "active") {
      addConflict(makeConflict(
        "venue",
        `Venue "${item.venue.name}" is ${item.venue.status}.`,
        [item.sessionId],
        [item.venueId]
      ));
    }

    if (item.entry.capacity > item.venue.capacity) {
      addConflict(makeConflict(
        "venue",
        `Scheduled capacity ${item.entry.capacity} exceeds venue capacity ${item.venue.capacity}.`,
        [item.sessionId],
        [item.venueId]
      ));
    }

    if (
      item.session.maxParticipants != null &&
      item.entry.capacity < item.session.maxParticipants
    ) {
      addConflict(makeConflict(
        "venue",
        `Scheduled capacity ${item.entry.capacity} is below the session maximum of ${item.session.maxParticipants}.`,
        [item.sessionId],
        [item.venueId]
      ));
    }
  }

  // Detect sessions overlapping in the same venue.
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const a = entries[i];
      const b = entries[j];

      if (
        a.venueId === b.venueId &&
        overlaps(a.start, a.end, b.start, b.end)
      ) {
        addConflict(makeConflict(
          "venue",
          `Sessions overlap in venue ${a.venueId}.`,
          [a.sessionId, b.sessionId],
          [a.venueId]
        ));
      }
    }
  }

  // Aggregate resource demand by session and resource, then check availability
  // and overlapping demand against the festival's inventory.
  const resourceEvents = new Map();

  for (const item of entries) {
    const allocationsById = new Map();

    for (const allocation of item.entry.resourcesAllocated || []) {
      const resourceId = String(allocation.resourceId);
      const quantity = Number(allocation.quantity);
      const resource = resourcesById.get(resourceId);

      if (!resource) {
        throw new ScheduleValidationError(
          422,
          "Schedule snapshot contains a missing or cross-festival resource reference.",
          {
            validationErrors: [{
              entryIndex: item.index,
              message: `Resource ${resourceId} must exist and belong to this festival.`,
            }],
          }
        );
      }

      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new ScheduleValidationError(
          422,
          "Schedule snapshot contains an invalid resource quantity.",
          {
            validationErrors: [{
              entryIndex: item.index,
              message: `Quantity for resource ${resourceId} must be a positive integer.`,
            }],
          }
        );
      }

      allocationsById.set(
        resourceId,
        (allocationsById.get(resourceId) || 0) + quantity
      );
    }

    const allocatedIds = new Set(allocationsById.keys());

    // The session model identifies required resource types, but does not store
    // a required quantity. This treats each listed requirement as quantity 1.
    for (const requiredResourceId of item.session.resourcesRequired || []) {
      const resourceId = String(requiredResourceId);
      const resource = resourcesById.get(resourceId);

      if (!resource) {
        throw new ScheduleValidationError(
          422,
          "A session references a missing or cross-festival required resource.",
          {
            validationErrors: [{
              sessionId: item.sessionId,
              resourceId,
              message: "Required resource must exist and belong to this festival.",
            }],
          }
        );
      }

      if (!allocatedIds.has(resourceId)) {
        addConflict(makeConflict(
          "resource",
          `Session is missing required resource "${resource.name}".`,
          [item.sessionId],
          [],
          [{ resourceId: resource._id, quantity: 1 }]
        ));
      }
    }

    for (const [resourceId, quantity] of allocationsById) {
      const resource = resourcesById.get(resourceId);

      if (resource.availabilityStatus !== "available") {
        addConflict(makeConflict(
          "resource",
          `Resource "${resource.name}" is ${resource.availabilityStatus}.`,
          [item.sessionId],
          [],
          [{ resourceId: resource._id, quantity }]
        ));
      }

      if (quantity > resource.quantity) {
        addConflict(makeConflict(
          "resource",
          `Session requests ${quantity} of "${resource.name}", but only ${resource.quantity} exist.`,
          [item.sessionId],
          [],
          [{ resourceId: resource._id, quantity }]
        ));
      }

      if (!resourceEvents.has(resourceId)) {
        resourceEvents.set(resourceId, { resource, events: [] });
      }

      const events = resourceEvents.get(resourceId).events;
      events.push({
        time: item.start,
        delta: 1,
        sessionId: item.sessionId,
        quantity,
      });
      events.push({
        time: item.end,
        delta: -1,
        sessionId: item.sessionId,
        quantity,
      });
    }
  }

  for (const { resource, events } of resourceEvents.values()) {
    // End events precede start events at equal times, allowing back-to-back use.
    events.sort((a, b) => a.time - b.time || a.delta - b.delta);

    const activeSessions = new Map();

    for (const event of events) {
      if (event.delta === -1) {
        activeSessions.delete(event.sessionId);
        continue;
      }

      activeSessions.set(event.sessionId, event.quantity);

      const totalDemand = [...activeSessions.values()]
        .reduce((sum, quantity) => sum + quantity, 0);

      if (totalDemand > resource.quantity) {
        addConflict(makeConflict(
          "resource",
          `Overlapping sessions request ${totalDemand} of "${resource.name}", but only ${resource.quantity} exist.`,
          [...activeSessions.keys()],
          [],
          [{ resourceId: resource._id, quantity: totalDemand }]
        ));
      }
    }
  }

  // A volunteer cannot cover overlapping sessions.
  const assignmentsByVolunteer = new Map();

  for (const item of entries) {
    for (const volunteerId of item.entry.volunteersAssigned || []) {
      const id = String(volunteerId);

      if (!assignmentsByVolunteer.has(id)) {
        assignmentsByVolunteer.set(id, []);
      }

      assignmentsByVolunteer.get(id).push(item);
    }
  }

  for (const [volunteerId, assignments] of assignmentsByVolunteer) {
    for (let i = 0; i < assignments.length; i += 1) {
      for (let j = i + 1; j < assignments.length; j += 1) {
        const a = assignments[i];
        const b = assignments[j];

        if (overlaps(a.start, a.end, b.start, b.end)) {
          addConflict(makeConflict(
            "time",
            `Volunteer ${volunteerId} is assigned to overlapping sessions.`,
            [a.sessionId, b.sessionId]
          ));
        }
      }
    }
  }

  return conflicts;
}

export async function validateScheduleVersion({ festivalId, versionId }) {
  if (
    !Types.ObjectId.isValid(festivalId) ||
    !Types.ObjectId.isValid(versionId)
  ) {
    throw new ScheduleValidationError(
      400,
      "Invalid festival or schedule version ID."
    );
  }

  const version = await ScheduleVersionModel.findOne({
    _id: versionId,
    festivalId,
  });

  if (!version) {
    throw new ScheduleValidationError(404, "Schedule version not found.");
  }

  if (version.status !== "draft") {
    throw new ScheduleValidationError(
      409,
      "Only draft schedule versions can be validated."
    );
  }

  const snapshot = version.scheduleSnapshot || [];
  const sessionIds = [...new Set(snapshot.map((entry) => String(entry.sessionId)))];
  const venueIds = [...new Set(snapshot.map((entry) => String(entry.venueId)))];
  const allocatedResourceIds = snapshot.flatMap((entry) =>
    (entry.resourcesAllocated || []).map((allocation) =>
      String(allocation.resourceId)
    )
  );

  const invalidIds = [...sessionIds, ...venueIds, ...allocatedResourceIds]
    .filter((id) => !Types.ObjectId.isValid(id));

  if (invalidIds.length > 0) {
    throw new ScheduleValidationError(
      422,
      "Schedule snapshot contains invalid IDs.",
      { invalidIds }
    );
  }

  const [sessions, venues] = await Promise.all([
    FestivalSessionModel.find({
      _id: { $in: sessionIds },
      festivalId,
    }).select("_id resourcesRequired maxParticipants proposalStatus").lean(),

    VenueModel.find({
      _id: { $in: venueIds },
      festivalId,
    }).select("_id name capacity status").lean(),
  ]);

  const sessionsById = new Map(sessions.map((item) => [String(item._id), item]));
  const venuesById = new Map(venues.map((item) => [String(item._id), item]));

  const requiredResourceIds = sessions.flatMap((session) =>
    (session.resourcesRequired || []).map(String)
  );

  const allResourceIds = [...new Set([
    ...allocatedResourceIds,
    ...requiredResourceIds,
  ])];

  const invalidRequiredIds = allResourceIds
    .filter((id) => !Types.ObjectId.isValid(id));

  if (invalidRequiredIds.length > 0) {
    throw new ScheduleValidationError(
      422,
      "A session contains an invalid required resource ID.",
      { invalidIds: invalidRequiredIds }
    );
  }

  const resources = await ResourceModel.find({
    _id: { $in: allResourceIds },
    festivalId,
  }).select("_id name quantity availabilityStatus").lean();

  const resourcesById = new Map(resources.map((item) => [String(item._id), item]));

  const conflicts = calculateConflicts(
    snapshot,
    sessionsById,
    venuesById,
    resourcesById
  );

  // Recalculation resets previous resolutions. If the draft changed, its old
  // conflict decisions must be reviewed again.
  version.conflictDetails = conflicts;
  await version.save();

  return {
    scheduleVersionId: String(version._id),
    isValid: conflicts.length === 0,
    conflictCount: conflicts.length,
    conflicts: version.conflictDetails,
  };
}
