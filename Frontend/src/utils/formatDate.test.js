import test from "node:test";
import assert from "node:assert/strict";
import { fromDateTimeLocalInput, toDateTimeLocalInput } from "./formatDate.js";

test("datetime-local display and submission preserve the same instant", () => {
  process.env.TZ = "Asia/Kolkata";
  const instant = "2026-11-06T09:15:00.000Z";
  const localInput = toDateTimeLocalInput(instant);

  assert.equal(localInput, "2026-11-06T14:45");
  assert.equal(fromDateTimeLocalInput(localInput), instant);
});

test("invalid and empty date-time values do not become accidental timestamps", () => {
  assert.equal(toDateTimeLocalInput("not-a-date"), "");
  assert.equal(fromDateTimeLocalInput(""), "");
  assert.equal(fromDateTimeLocalInput("not-a-date"), "");
});
