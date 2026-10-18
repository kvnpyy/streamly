import { describe, expect, it } from "vitest";
import {
  CLIENT_NETWORK_ERROR_MESSAGE,
  clientErrorMessage,
  isClientNetworkError,
} from "./client-network-error";

describe("isClientNetworkError", () => {
  it("detects Safari Load failed", () => {
    expect(isClientNetworkError(new TypeError("Load failed"))).toBe(true);
  });

  it("detects Chromium Failed to fetch", () => {
    expect(isClientNetworkError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("detects NetworkError name", () => {
    const err = new Error("boom");
    err.name = "NetworkError";
    expect(isClientNetworkError(err)).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(isClientNetworkError(new Error("Invalid email or password."))).toBe(
      false
    );
    expect(isClientNetworkError("Load failed")).toBe(false);
    expect(isClientNetworkError(null)).toBe(false);
  });
});

describe("clientErrorMessage", () => {
  it("maps network failures to a stable UI string", () => {
    expect(clientErrorMessage(new TypeError("Load failed"))).toBe(
      CLIENT_NETWORK_ERROR_MESSAGE
    );
  });

  it("keeps other Error messages", () => {
    expect(clientErrorMessage(new Error("Passwords don’t match."))).toBe(
      "Passwords don’t match."
    );
  });

  it("uses fallback for non-errors", () => {
    expect(clientErrorMessage(undefined, "Try again.")).toBe("Try again.");
  });
});
