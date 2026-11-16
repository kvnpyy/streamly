import { afterEach, describe, expect, it } from "vitest";
import { reportUxPageReload } from "./ux-frustration-telemetry";

const STORAGE_DENIED =
  "Failed to read the 'sessionStorage' property from 'Window': Access is denied for this document.";

describe("reportUxPageReload sessionStorage SecurityError", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "sessionStorage");
  });

  it("does not throw when reading sessionStorage is denied", () => {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      get() {
        throw Object.assign(new Error(STORAGE_DENIED), { name: "SecurityError" });
      },
    });

    expect(() =>
      reportUxPageReload({ path: "/app/live", isReload: true })
    ).not.toThrow();
  });
});
