import test from "node:test";
import assert from "node:assert/strict";
import { calculateConflicts } from "./validation.service.js";

const sessions = new Map([
  ["s1", { _id: "s1", proposalStatus: "approved", resourcesRequired: [], maxParticipants: null }],
  ["s2", { _id: "s2", proposalStatus: "approved", resourcesRequired: [], maxParticipants: null }],
]);
const venues = new Map([
  ["v1", { _id: "v1", name: "Hall A", status: "active", capacity: 100 }],
  ["v2", { _id: "v2", name: "Hall B", status: "active", capacity: 100 }],
]);
const resources = new Map();

function entry(sessionId, startTime, endTime, venueId = "v1", volunteersAssigned = []) {
  return {
    sessionId,
    venueId,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    capacity: 50,
    resourcesAllocated: [],
    volunteersAssigned,
  };
}

test("allows back-to-back sessions in the same venue", () => {
  const conflicts = calculateConflicts([
    entry("s1", "2026-11-06T09:00:00Z", "2026-11-06T10:00:00Z"),
    entry("s2", "2026-11-06T10:00:00Z", "2026-11-06T11:00:00Z"),
  ], sessions, venues, resources);

  assert.deepEqual(conflicts, []);
});

test("detects an overlapping booking for the same venue", () => {
  const conflicts = calculateConflicts([
    entry("s1", "2026-11-06T09:00:00Z", "2026-11-06T10:00:00Z"),
    entry("s2", "2026-11-06T09:30:00Z", "2026-11-06T10:30:00Z"),
  ], sessions, venues, resources);

  assert.equal(conflicts.some((conflict) => conflict.conflictType === "venue"), true);
});

test("allows simultaneous sessions in different venues unless a volunteer is double-booked", () => {
  const conflicts = calculateConflicts([
    entry("s1", "2026-11-06T09:00:00Z", "2026-11-06T10:00:00Z", "v1", ["volunteer-1"]),
    entry("s2", "2026-11-06T09:30:00Z", "2026-11-06T10:30:00Z", "v2", ["volunteer-1"]),
  ], sessions, venues, resources);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].conflictType, "time");
});
