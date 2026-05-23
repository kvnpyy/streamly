import { describe, expect, it } from "vitest";
import {
  EMAIL_BRAND,
  emailParagraph,
  escapeHtml,
  renderStreamlyEmail,
} from "./email-template";

describe("escapeHtml", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`<script>"'&</script>`)).toBe(
      "&lt;script&gt;&quot;&#39;&amp;&lt;/script&gt;"
    );
  });
});

describe("renderStreamlyEmail", () => {
  it("includes brand shell, preheader, and CTA", () => {
    const html = renderStreamlyEmail({
      preheader: "Confirm your account",
      headline: "Verify email",
      bodyHtml: emailParagraph("Almost there."),
      ctas: [{ label: "Verify", href: "https://example.com/v", variant: "primary" }],
      footnote: "Link expires in 48 hours.",
    });
    expect(html).toContain("Confirm your account");
    expect(html).toContain("Verify email");
    expect(html).toContain(EMAIL_BRAND.brand);
    expect(html).toContain('href="https://example.com/v"');
    expect(html).toContain("Link expires in 48 hours.");
    expect(html).toContain("<!DOCTYPE html>");
  });
});
