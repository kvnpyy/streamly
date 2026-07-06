import { describe, expect, it } from "vitest";
import {
  coerceHttpResponseStatus,
  isValidHttpResponseStatus,
} from "./http-response-status";

describe("http response status helpers", () => {
  it("accepts statuses that can be used to construct a Response", () => {
    expect(isValidHttpResponseStatus(200)).toBe(true);
    expect(isValidHttpResponseStatus(206)).toBe(true);
    expect(isValidHttpResponseStatus(599)).toBe(true);
  });

  it("rejects statuses outside the Response constructor range", () => {
    expect(isValidHttpResponseStatus(0)).toBe(false);
    expect(isValidHttpResponseStatus(199)).toBe(false);
    expect(isValidHttpResponseStatus(600)).toBe(false);
    expect(isValidHttpResponseStatus(Number.NaN)).toBe(false);
    expect(isValidHttpResponseStatus(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidHttpResponseStatus(200.5)).toBe(false);
  });

  it("coerces invalid statuses to a valid fallback", () => {
    expect(coerceHttpResponseStatus(0)).toBe(502);
    expect(coerceHttpResponseStatus(600, 503)).toBe(503);
    expect(coerceHttpResponseStatus(0, 0)).toBe(500);
  });
});
