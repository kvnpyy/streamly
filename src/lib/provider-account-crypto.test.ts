import { decryptProviderCredentials, encryptProviderCredentials } from "./provider-account-crypto";
import { describe, expect, it } from "vitest";

describe("provider-account-crypto", () => {
  it("roundtrips Xtream credentials", () => {
    const creds = {
      server: "http://example.com:8080",
      username: "demo",
      password: "secret-pass",
    };
    const blob = encryptProviderCredentials("user-a", "acct-1", creds);
    expect(blob.startsWith("p1.")).toBe(true);
    expect(decryptProviderCredentials("user-a", "acct-1", blob)).toEqual(creds);
  });

  it("does not decrypt with wrong account id", () => {
    const creds = {
      server: "http://example.com",
      username: "u",
      password: "p",
    };
    const blob = encryptProviderCredentials("user-a", "acct-1", creds);
    expect(decryptProviderCredentials("user-a", "acct-2", blob)).toBeNull();
  });
});
