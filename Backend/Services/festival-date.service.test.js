import test from "node:test";
import assert from "node:assert/strict";
import { isWithinFestivalDates } from "./festival-date.service.js";

const festival = {
  startDate: "2026-11-06T00:00:00.000Z",
  endDate: "2026-11-07T00:00:00.000Z",
};

test("accepts session timings across the full inclusive festival date range", () => {
  assert.equal(
    isWithinFestivalDates("2026-11-06T09:00:00.000Z", "2026-11-07T20:00:00.000Z", festival),
    true,
  );
});

test("allows a session to end exactly at midnight after the festival end date", () => {
  assert.equal(
    isWithinFestivalDates("2026-11-07T23:00:00.000Z", "2026-11-08T00:00:00.000Z", festival),
    true,
  );
});

test("rejects sessions outside the festival dates and invalid ranges", () => {
  assert.equal(
    isWithinFestivalDates("2026-11-05T23:59:00.000Z", "2026-11-06T01:00:00.000Z", festival),
    false,
  );
  assert.equal(
    isWithinFestivalDates("2026-11-07T23:00:00.000Z", "2026-11-08T00:01:00.000Z", festival),
    false,
  );
  assert.equal(
    isWithinFestivalDates("2026-11-06T10:00:00.000Z", "2026-11-06T10:00:00.000Z", festival),
    false,
  );
});
