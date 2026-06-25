import { describe, expect, it, vi, beforeEach } from "vitest";
import { pollStreamSession } from "./poll-stream-session";

vi.mock("next-auth/react", () => ({
  getSession: vi.fn(),
}));

import { getSession } from "next-auth/react";

describe("pollStreamSession", () => {
  beforeEach(() => {
    vi.mocked(getSession).mockReset();
  });

  it("returns immediately when session is already available", async () => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: "u1" },
      expires: "",
    } as never);
    const session = await pollStreamSession(0);
    expect(session?.user?.id).toBe("u1");
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it("polls until session appears", async () => {
    vi.mocked(getSession)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ user: { id: "u2" }, expires: "" } as never);
    const session = await pollStreamSession(1000);
    expect(session?.user?.id).toBe("u2");
    expect(getSession.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
