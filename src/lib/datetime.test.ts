import { describe, expect, it } from "vitest";

import {
  formatCountdown,
  formatGameDateTime,
  formatTimeWithSeconds,
  fromDateTimeLocalValue,
  nextOccurrence,
  previousOccurrence,
  toDateTimeLocalValue,
} from "@/lib/datetime";

/**
 * Brasilia is UTC-3 all year, so 20:00 local is 23:00 UTC. These tests exist because
 * Vercel runs in UTC and a missing time zone would silently show the wrong hour.
 */
describe("datetime in America/Sao_Paulo", () => {
  it("formats a pelada with the zone, not the machine zone", () => {
    // Wednesday 2026-10-07 20:00 in Brasilia.
    expect(formatGameDateTime("2026-10-07T23:00:00.000Z")).toBe(
      "Quarta-feira, 07 de outubro às 20:00",
    );
  });

  it("shows the confirmation time down to the second", () => {
    expect(formatTimeWithSeconds("2026-10-05T23:00:13.456Z")).toBe("20:00:13");
  });

  it("formats a countdown", () => {
    expect(formatCountdown(0)).toBe("00:00:00");
    expect(formatCountdown(-5000)).toBe("00:00:00");
    expect(formatCountdown(2 * 3600_000 + 13 * 60_000 + 45_000)).toBe("02:13:45");
    expect(formatCountdown(26 * 3600_000)).toBe("1d 02:00:00");
  });

  describe("nextOccurrence", () => {
    it("finds the next Wednesday at 20:00 from a Monday", () => {
      // Monday 2026-10-05 10:00 Brasilia.
      const result = nextOccurrence("2026-10-05T13:00:00.000Z", 3, "20:00");
      expect(result).toBe("2026-10-07T23:00:00.000Z");
    });

    it("keeps today when the time has not passed yet", () => {
      // Wednesday 2026-10-07 09:00 Brasilia.
      const result = nextOccurrence("2026-10-07T12:00:00.000Z", 3, "20:00");
      expect(result).toBe("2026-10-07T23:00:00.000Z");
    });

    it("jumps a week when today's time has already passed", () => {
      // Wednesday 2026-10-07 21:00 Brasilia, after kickoff.
      const result = nextOccurrence("2026-10-08T00:00:00.000Z", 3, "20:00");
      expect(result).toBe("2026-10-14T23:00:00.000Z");
    });

    it("crosses the end of a month", () => {
      // Friday 2026-10-30 Brasilia -> next Wednesday is in November.
      const result = nextOccurrence("2026-10-30T13:00:00.000Z", 3, "20:00");
      expect(result).toBe("2026-11-04T23:00:00.000Z");
    });
  });

  describe("previousOccurrence", () => {
    it("opens the list on the Monday before a Wednesday game", () => {
      const game = "2026-10-07T23:00:00.000Z";
      expect(previousOccurrence(game, 1, "20:00")).toBe("2026-10-05T23:00:00.000Z");
    });

    it("goes back a full week when the weekday matches the game day", () => {
      const game = "2026-10-07T23:00:00.000Z";
      // Opening on Wednesday 20:00 cannot be the game's own instant.
      expect(previousOccurrence(game, 3, "20:00")).toBe("2026-09-30T23:00:00.000Z");
    });

    it("crosses the start of a month", () => {
      // Wednesday 2026-11-04 20:00 -> Monday 2026-11-02 20:00.
      const game = "2026-11-04T23:00:00.000Z";
      expect(previousOccurrence(game, 1, "20:00")).toBe("2026-11-02T23:00:00.000Z");
    });
  });

  describe("datetime-local round trip", () => {
    it("shows a UTC instant as the local wall clock", () => {
      expect(toDateTimeLocalValue("2026-10-07T23:00:00.000Z")).toBe("2026-10-07T20:00");
    });

    it("reads the local wall clock back as UTC", () => {
      expect(fromDateTimeLocalValue("2026-10-07T20:00")).toBe("2026-10-07T23:00:00.000Z");
    });

    it("round trips", () => {
      const iso = "2027-03-17T23:30:00.000Z";
      expect(fromDateTimeLocalValue(toDateTimeLocalValue(iso))).toBe(iso);
    });

    it("rejects a malformed value instead of guessing", () => {
      expect(() => fromDateTimeLocalValue("nao-e-data")).toThrow();
    });
  });
});
