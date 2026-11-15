import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../../types";
import { formatDate, groupSessions } from "./sidebarUtils";

const NOW = new Date("2026-06-15T12:00:00Z");

function daysAgo(days: number): string {
  // Backend timestamps are naive UTC ISO strings without a trailing "Z".
  return new Date(NOW.getTime() - days * 86400000).toISOString().slice(0, -1);
}

function session(id: string, days: number): Session {
  return { id, title: id, updated_at: daysAgo(days) } as Session;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("formatDate", () => {
  it("returns an empty string for missing dates", () => {
    expect(formatDate("")).toBe("");
  });

  it("labels today and yesterday", () => {
    expect(formatDate(daysAgo(0))).toBe("Today");
    expect(formatDate(daysAgo(1))).toBe("Yesterday");
  });
});

describe("groupSessions", () => {
  it("puts sessions into age buckets and skips empty ones", () => {
    const groups = groupSessions([
      session("a", 0),
      session("b", 1),
      session("c", 3),
      session("d", 100),
    ]);

    expect(groups.map((g) => g.label)).toEqual([
      "Today",
      "Yesterday",
      "Previous 7 days",
      "Older",
    ]);
    expect(groups.map((g) => g.items.map((s) => s.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ]);
  });

  it("returns no groups for no sessions", () => {
    expect(groupSessions([])).toEqual([]);
  });
});
