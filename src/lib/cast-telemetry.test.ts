import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

import { castBreadcrumb } from "./cast-telemetry";

describe("castBreadcrumb", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://public@example.com/1";
    sentry.addBreadcrumb.mockReset();
    sentry.captureMessage.mockReset();
  });

  it("keeps Cast session failures as breadcrumbs without opening Sentry issues", () => {
    castBreadcrumb("cast_session_fail", {
      kind: "live",
      channelId: 123,
      code: null,
    });

    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "cast",
        message: "cast_session_fail",
        level: "warning",
      })
    );
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });

  it("still reports receiver playback failures to Sentry", () => {
    castBreadcrumb("cast_stall", {
      kind: "live",
      channelId: 123,
      playerState: "unknown",
    });

    expect(sentry.captureMessage).toHaveBeenCalledWith(
      "cast:cast_stall",
      expect.objectContaining({
        level: "warning",
        tags: expect.objectContaining({
          cast_event: "cast_stall",
          cast_kind: "live",
        }),
      })
    );
  });
});
