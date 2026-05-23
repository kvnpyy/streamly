import type { Metadata } from "next";
import Link from "next/link";
import { legalContactEmail, legalProvinceCanada } from "@/lib/legal-site";
import { SITE_NAME } from "@/lib/site-brand";

export const metadata: Metadata = {
  title: `Privacy Policy — ${SITE_NAME}`,
  description: `How ${SITE_NAME} handles data for the IPTV client.`,
};

export default function PrivacyPage() {
  const contact = legalContactEmail();
  const province = legalProvinceCanada();

  return (
    <div className="min-h-screen bg-[#06070b] text-[#eef0f6] px-4 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
          <Link
            href="/login"
            className="text-sm text-(--text-muted) hover:text-(--text) underline underline-offset-2"
          >
            ← Back to {SITE_NAME}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-(--text-muted) mt-2">
            Last updated: May 2026 · Summary for a self-hosted-style IPTV client —
            have counsel review if you market worldwide or handle EU personal data at
            scale.
          </p>
        </div>

        <aside className="rounded-xl border border-(--brand)/30 bg-(--brand)/10 px-4 py-3 text-xs text-(--text-dim) leading-relaxed">
          <strong className="text-(--text)">Where we operate.</strong> This
          deployment is operated from <strong className="text-(--text)">Canada</strong>
          . Servers that run the app and database may be located in the{" "}
          <strong className="text-(--text)">Netherlands (EU)</strong>. That means
          personal data you give us may be{" "}
          <strong className="text-(--text)">stored and processed in the EU</strong>,
          while the relationship with you may still be governed by Canadian law and
          your local consumer rules where they apply.
        </aside>

        <div className="space-y-6 text-(--text-dim) leading-relaxed text-sm">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Who is responsible
            </h2>
            <p>
              The <strong className="text-(--text)">operator</strong> of this{" "}
              {SITE_NAME} deployment (the person or company running the website you are
              using) is the controller of personal data described here. {SITE_NAME} is
              built so each deployment can have its own operator; this policy describes
              typical processing.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Data we process
            </h2>
            <p>
              To play your content, {SITE_NAME} processes{" "}
              <strong className="text-(--text)">
                IPTV server URLs, usernames, and passwords
              </strong>{" "}
              that you enter. Those values may be stored in an encrypted HttpOnly
              cookie (guest mode) or encrypted at rest when you attach providers to a
              {SITE_NAME} account. We use them only to talk to your panel and proxy streams
              — not to sell profiles or advertising segments.
            </p>
            <p className="pt-2">
              <strong className="text-(--text)">No sale of personal information.</strong>{" "}
              We do not sell your personal information as that term is commonly
              defined in consumer privacy laws (including California &ldquo;sale&rdquo;
              concepts). We do not use your IPTV credentials to build advertising
              profiles.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Minimization &amp; purpose
            </h2>
            <p>
              We collect and process personal data only for reasonable business
              purposes: providing {SITE_NAME}, securing the service, complying with law,
              and improving reliability (for example error telemetry if the operator
              enables it). We do not collect sensitive categories (health, biometrics,
              etc.) through {SITE_NAME} by design.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Retention
            </h2>
            <p>
              The operator sets how long logs and backups are kept. Account and
              encrypted provider data remain until you delete your {SITE_NAME} account or
              we delete it for inactivity, security, or legal reasons as described in
              our{" "}
              <Link
                href="/legal/terms"
                className="text-(--brand-2) underline underline-offset-2"
              >
                Terms of Service
              </Link>
              . We do not promise indefinite retention of server logs; retention may be
              shortened without notice where the law allows.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Security
            </h2>
            <p>
              We use industry-typical safeguards (encryption for credentials at rest
              and in transit where applicable, access controls on servers, and secure
              development practices).{" "}
              <strong className="text-(--text)">
                No method of transmission or storage is 100% secure.
              </strong>{" "}
              If we become aware of an incident that affects your personal data and
              the law requires notice, we will follow applicable breach-notification
              rules for this deployment.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Legal requests &amp; disclosure
            </h2>
            <p>
              We may preserve or disclose information when we reasonably believe it is
              required by law, regulation, legal process, or governmental request; to
              enforce our terms or investigate abuse; or to protect the rights,
              property, or safety of users, the public, or us. Where permitted, we may
              notify you before disclosure unless law or a court order prohibits it.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              International transfers
            </h2>
            <p>
              If you connect from outside the EU, your information may still be stored
              on servers in the <strong className="text-(--text)">European Economic
              Area</strong> (this deployment uses EU infrastructure). Depending on
              where you live, you may have rights to information about safeguards
              (such as standard contractual clauses or adequacy decisions). Ask the
              operator for details if you need them for compliance.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Canada &amp; global rights
            </h2>
            <p>
              If you are in <strong className="text-(--text)">Canada</strong>, you may
              have rights under applicable federal or provincial privacy law (for
              example access, correction, and complaint pathways). If you are in the{" "}
              <strong className="text-(--text)">European Economic Area</strong> or the{" "}
              <strong className="text-(--text)">UK</strong>, you may have GDPR-style
              rights (access, erasure, restriction, portability, objection, and
              complaint to a supervisory authority) where they apply to our
              processing. If you are in{" "}
              <strong className="text-(--text)">California</strong> or other U.S.
              states with privacy laws, you may have additional disclosures or
              opt-outs depending on how the operator does business there.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Local device data
            </h2>
            <p>
              Favorites, recents, UI preferences (such as category selections), and
              parental-control settings are stored in your browser (
              <code className="text-(--text-muted) text-xs">localStorage</code>) on
              your device. Clearing site data removes them. If you sign in with a{" "}
              {SITE_NAME} account, your favorites for each IPTV login are also saved
              on this server so they can sync across devices.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Streaming &amp; logs
            </h2>
            <p>
              Video segments pass through this app&apos;s proxy when needed for CORS
              or mixed content. Hosts may keep minimal server logs (IP, errors,
              timing) for operations and abuse prevention — configure retention on your
              deployment.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Third parties
            </h2>
            <p>
              Your IPTV provider and any CDNs they use receive requests directly or
              via this proxy. Optional error reporting (e.g. Sentry), if enabled by
              the host, may send stack traces — configure DSN and sampling in
              deployment env vars. If you use{" "}
              <strong className="text-(--text)">Cloudflare Turnstile</strong>, Cloudflare
              receives data needed to run the challenge.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Cookies &amp; consent
            </h2>
            <p>
              Essential cookies or storage may be required for login and playback. If
              the operator enables{" "}
              <code className="text-(--text-muted) text-xs">
                NEXT_PUBLIC_SHOW_COOKIE_CONSENT
              </code>
              , a banner may record your analytics vs essential choice in{" "}
              <code className="text-(--text-muted) text-xs">localStorage</code>.
              When that banner is on, Google Analytics is only loaded if you choose
              analytics (e.g. &quot;Accept all&quot;).
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Product update emails
            </h2>
            <p>
              If you create a {SITE_NAME} account, you may optionally opt in to
              occasional emails about product features, tips, and launch news. We
              store that preference in our database and, when you opt in, may sync
              your contact to our email provider (Resend) for broadcasts. You can
              unsubscribe from any product-update message or change your preference
              in Settings. Transactional messages (email verification, password
              reset) are separate and may still be sent when needed for your account.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Your choices
            </h2>
            <p>
              Sign out to clear the IPTV session cookie. Delete your {SITE_NAME} account
              from Settings to remove encrypted provider rows from our database.
              {contact ? (
                <>
                  {" "}
                  For privacy requests, contact{" "}
                  <a
                    href={`mailto:${contact}?subject=Privacy%20request`}
                    className="text-(--brand-2) underline underline-offset-2"
                  >
                    {contact}
                  </a>
                  .
                </>
              ) : (
                " For privacy requests, use the operator's published contact (they may set NEXT_PUBLIC_LEGAL_CONTACT_EMAIL)."
              )}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Relationship to our Terms
            </h2>
            <p>
              Disclaimers, limitations of liability, indemnity, and dispute-related
              provisions that protect the operator are in our{" "}
              <Link
                href="/legal/terms"
                className="text-(--brand-2) underline underline-offset-2"
              >
                Terms of Service
              </Link>
              . This policy focuses on privacy practices, not liability caps.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Governing law (summary)
            </h2>
            <p>
              This policy is provided as a summary. Interpretation may be governed by{" "}
              {province ? (
                <>
                  the laws of Canada and the Province of {province} where the terms of
                  service say so
                </>
              ) : (
                "Canadian law where the terms of service say so"
              )}
              , without prejudice to mandatory rights in your own country.
            </p>
          </section>

          <p className="text-xs text-(--text-muted) pt-4 border-t border-(--line)">
            <Link href="/legal/terms" className="underline underline-offset-2">
              Terms of Service
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
