import { describe, expect, it } from "vitest";
import {
  isXtreamCredentials,
  pickSavedProviderAccountId,
} from "./restore-saved-providers";

describe("pickSavedProviderAccountId", () => {
  const accounts = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns preferred id when it exists in the list", () => {
    expect(pickSavedProviderAccountId(accounts, "b")).toBe("b");
  });

  it("falls back to first account when preference is missing", () => {
    expect(pickSavedProviderAccountId(accounts, null)).toBe("a");
  });

  it("falls back to first account when preference is stale", () => {
    expect(pickSavedProviderAccountId(accounts, "gone")).toBe("a");
  });

  it("returns undefined for empty list", () => {
    expect(pickSavedProviderAccountId([], "a")).toBeUndefined();
  });
});

describe("isXtreamCredentials", () => {
  it("accepts valid creds", () => {
    expect(
      isXtreamCredentials({
        server: "http://x",
        username: "u",
        password: "p",
      })
    ).toBe(true);
  });

  it("rejects partial objects", () => {
    expect(isXtreamCredentials({ server: "http://x", username: "u" })).toBe(
      false
    );
  });
});
