import type { Metadata } from "next";
import Link from "next/link";
import { legalContactEmail, legalProvinceCanada } from "@/lib/legal-site";
import { SITE_NAME } from "@/lib/site-brand";

export const metadata: Metadata = {
  title: `Terms of Service — ${SITE_NAME}`,
  description: `Terms of service for the ${SITE_NAME} IPTV client.`,
};

/** Repeated qualifier — consumer laws in some places limit certain waivers. */
const EXTENT =
  "To the maximum extent permitted by applicable law (including non-waivable consumer rights where you live)";

export default function TermsPage() {
  const contact = legalContactEmail();
  const province = legalProvinceCanada();
  const lawClause = province
    ? `the laws of Canada and the Province of ${province}`
    : "the laws of Canada";
  const courtRef = province
    ? `the courts of the Province of ${province}, Canada`
    : "the courts of Canada";

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
            Terms of Service
          </h1>
          <p className="text-sm text-(--text-muted) mt-2">
            Last updated: May 2026 · Plain-language terms —{" "}
            <strong className="text-(--text)">not</strong> legal advice. Have
            counsel review before marketing, paid plans, or high-risk launches.
          </p>
        </div>

        <aside className="rounded-xl border border-(--brand)/30 bg-(--brand)/10 px-4 py-3 text-xs text-(--text-dim) leading-relaxed">
          <strong className="text-(--text)">Geography.</strong> {SITE_NAME} is operated
          from <strong className="text-(--text)">Canada</strong>. The software and
          your data may be processed on servers in the{" "}
          <strong className="text-(--text)">European Union</strong> (for this
          deployment, infrastructure is in the{" "}
          <strong className="text-(--text)">Netherlands</strong>). Server location
          affects <strong className="text-(--text)">privacy and data residency</strong>
          , not a guarantee about copyright, enforcement, or liability in any
          country. You must comply with laws that apply to <em>you</em>.
        </aside>

        <div className="space-y-6 text-(--text-dim) leading-relaxed text-sm">
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Agreement &amp; eligibility
            </h2>
            <p>
              By accessing or using {SITE_NAME} on this website, you agree to these Terms
              and our{" "}
              <Link
                href="/legal/privacy"
                className="text-(--brand-2) underline underline-offset-2"
              >
                Privacy Policy
              </Link>
              . If you do not agree, do not use the service. You represent that you are
              at least the <strong className="text-(--text)">age of majority</strong>{" "}
              where you live (and at least 18 where 18 is higher). If you use {SITE_NAME}
              on behalf of an organization, you represent that you have authority to
              bind that organization.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              What {SITE_NAME} is (and is not)
            </h2>
            <p>
              {SITE_NAME} is a software client and proxy that helps you play IPTV streams
              from servers that speak the Xtream Codes-style API.{" "}
              <strong className="text-(--text)">
                We do not host, sell, sublicense, or endorse television channels or
                video content.
              </strong>{" "}
              You provide your own server URL and credentials (or use device pairing).
              Playback occurs between your browser or TV and third-party services you
              choose. We are not a party to your agreement with any IPTV provider and
              we do not monitor your streams for legality.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Acceptable use
            </h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                Use {SITE_NAME} with credentials, playlists, or sources you are not
                authorized to use, or in violation of copyright, contract, or
                applicable law.
              </li>
              <li>
                Probe, scan, or attack our systems, other users, or third parties;
                bypass rate limits, security controls, or authentication; or interfere
                with the integrity or performance of the service.
              </li>
              <li>
                Reverse engineer, decompile, or attempt to extract source code or keys
                from the service except where mandatory law allows interoperability.
              </li>
              <li>
                Use {SITE_NAME} to distribute malware, send spam, or process unlawful
                material through our infrastructure.
              </li>
              <li>
                Misrepresent your identity to harass, defraud, or impersonate others.
              </li>
              <li>
                Resell, sublicense, or commercially redistribute {SITE_NAME} itself
                without our prior written consent.
              </li>
            </ul>
            <p className="pt-1">
              We may investigate violations and cooperate with law enforcement and
              service providers when we reasonably believe it is appropriate and
              permitted by applicable law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Third-party services &amp; content
            </h2>
            <p>
              Your IPTV panel, EPG providers, CDNs, and networks are third parties.{" "}
              <strong className="text-(--text)">
                We are not responsible for their availability, accuracy, quality,
                pricing, geoblocks, or legality.
              </strong>{" "}
              {EXTENT}, you assume all risk from your choice of provider and content.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Worldwide access
            </h2>
            <p>
              Unless we block access, you may use {SITE_NAME} from many countries. Local
              laws differ (including rules on IPTV, decryption, and rebroadcasting).
              You alone determine whether your use is lawful where you are. We may
              refuse, suspend, or terminate access if we reasonably believe you have
              violated these terms or the law.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Accounts, credentials &amp; accuracy
            </h2>
            <p>
              Optional {SITE_NAME} accounts store encrypted provider credentials on our
              servers. Guest sessions may store credentials in an encrypted HttpOnly
              cookie. You are responsible for safeguarding passwords and devices. You
              agree that account information you provide is accurate and that you will
              update it when it changes. You may delete a {SITE_NAME} account (and saved
              providers) from Settings when signed in.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Monitoring &amp; security
            </h2>
            <p>
              {EXTENT}, we may log technical data (such as IP addresses, timestamps,
              User-Agent strings, request paths, and error diagnostics) to operate the
              service, prevent abuse, and comply with law. See the Privacy Policy for
              detail.{" "}
              <strong className="text-(--text)">
                We do not sell your credentials or use them for advertising.
              </strong>
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Copyright notices (material on our servers)
            </h2>
            <p>
              {SITE_NAME} does not host your provider&apos;s video streams. If you believe
              material <strong className="text-(--text)">stored on our systems</strong>{" "}
              (for example text or assets we control) infringes your rights, send a
              detailed notice{contact ? " to " : ""}
              {contact ? (
                <a
                  href={`mailto:${contact}?subject=Copyright%20notice`}
                  className="text-(--brand-2) underline underline-offset-2"
                >
                  {contact}
                </a>
              ) : (
                " using the contact email published by this deployment (set by the operator)."
              )}{" "}
              We may remove or restrict access to content we host where required by law
              and after good-faith review. We cannot remove or modify content on
              third-party IPTV panels you connect to.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Disclaimers — no warranties
            </h2>
            <p>
              {EXTENT}, the service is provided{" "}
              <strong className="text-(--text)">&ldquo;as is&rdquo; and &ldquo;as
              available&rdquo;</strong> without warranties of any kind, whether express,
              implied, or statutory — including implied warranties of merchantability,
              fitness for a particular purpose, title, quiet enjoyment, accuracy, or
              non-infringement. We do not warrant that the service will be
              uninterrupted, error-free, secure, or free of harmful components; that
              streams will play on every device; or that defects will be corrected.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Limitation of liability
            </h2>
            <p>
              {EXTENT},{" "}
              <strong className="text-(--text)">
                neither the operator nor its affiliates, directors, employees, or
                contractors
              </strong>{" "}
              will be liable for any indirect, incidental, special, consequential,
              exemplary, or punitive damages, or for loss of profits, revenues, data,
              goodwill, or other intangible losses, arising from or related to your use
              of {SITE_NAME} — even if advised of the possibility — except where such
              exclusion is prohibited.
            </p>
            <p>
              {EXTENT}, our aggregate liability for all claims arising out of or related
              to the service or these terms is limited to the greater of{" "}
              <strong className="text-(--text)">(a)</strong> the amounts you paid us
              for {SITE_NAME} in the twelve (12) months before the claim, or{" "}
              <strong className="text-(--text)">(b) one hundred Canadian dollars
              (CAD&nbsp;$100)</strong>, if you have not paid us. Some jurisdictions do
              not allow certain limitations; in those cases our liability is limited
              to the fullest extent still permitted.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Indemnification
            </h2>
            <p>
              {EXTENT}, you will defend, indemnify, and hold harmless the operator and
              its affiliates, directors, employees, and contractors from and against
              any claims, damages, losses, liabilities, costs, and expenses (including
              reasonable attorneys&apos; fees) arising out of or related to: (a) your
              use of {SITE_NAME} or content you access through it; (b) your violation of
              these terms or applicable law; (c) your violation of third-party rights;
              or (d) a dispute between you and any IPTV provider or other third party.
              We may assume exclusive defense of any matter subject to indemnification
              at our expense; you agree to cooperate.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Release of third-party disputes
            </h2>
            <p>
              {EXTENT}, you release the operator from claims, demands, and damages of
              every kind arising from disputes between you and any third party
              (including IPTV providers, rightsholders, or networks) connected to your
              use of {SITE_NAME}.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Informal dispute resolution
            </h2>
            <p>
              Before filing a claim in court, you agree to contact us{contact ? " at " : ""}
              {contact ? (
                <a
                  href={`mailto:${contact}?subject=${encodeURIComponent(`Dispute - ${SITE_NAME}`)}`}
                  className="text-(--brand-2) underline underline-offset-2"
                >
                  {contact}
                </a>
              ) : (
                " at the operator's published contact"
              )}{" "}
              and try to resolve the dispute informally for at least{" "}
              <strong className="text-(--text)">thirty (30) days</strong>. {EXTENT},
              nothing in this section limits either party&apos;s right to seek urgent
              injunctive relief where the law allows.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Governing law &amp; venue
            </h2>
            <p>
              These terms are governed by {lawClause}, excluding conflict-of-law rules
              that would apply another jurisdiction&apos;s substantive law. Subject to
              non-waivable consumer protections where you live, you agree that{" "}
              {courtRef} have <strong className="text-(--text)">non-exclusive</strong>{" "}
              jurisdiction over disputes arising from these terms or your use of
              {SITE_NAME}, unless mandatory local law requires a different forum.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              Changes, suspension &amp; termination
            </h2>
            <p>
              We may modify these terms by posting an updated version on this site
              (and, where we have your email and the law requires, by other notice).
              Material changes will show a new &ldquo;Last updated&rdquo; date.
              Continued use after changes become effective means you accept the
              revised terms, except where applicable law requires a different process
              for you to consent.
            </p>
            <p className="pt-1">
              {EXTENT}, we may suspend or terminate access to {SITE_NAME} at any time, with
              or without notice, for operational, security, or legal reasons — including
              breach of these terms. Provisions that by their nature should survive
              (including limitations of liability, indemnities, and governing law)
              survive termination.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">
              General legal terms
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-(--text)">Entire agreement.</strong> These
                terms and the Privacy Policy are the entire agreement between you and
                the operator regarding {SITE_NAME} on this site (unless you have a
                separate signed agreement).
              </li>
              <li>
                <strong className="text-(--text)">Assignment.</strong> You may not
                assign these terms without our consent. We may assign them in
                connection with a merger, acquisition, or sale of assets.
              </li>
              <li>
                <strong className="text-(--text)">No waiver.</strong> Failure to
                enforce a provision is not a waiver.
              </li>
              <li>
                <strong className="text-(--text)">Severability.</strong> If a
                provision is invalid or unenforceable, the remainder stays in effect.
              </li>
              <li>
                <strong className="text-(--text)">Electronic notices.</strong> You
                consent to receive terms and operational notices electronically via
                the website (and email if you provide it).
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-(--text)">Contact</h2>
            <p>
              For abuse or security reports, contact the operator of this {SITE_NAME}
              deployment
              {contact ? (
                <>
                  :{" "}
                  <a
                    href={`mailto:${contact}?subject=${encodeURIComponent(`${SITE_NAME} report`)}`}
                    className="text-(--brand-2) underline underline-offset-2"
                  >
                    {contact}
                  </a>
                </>
              ) : (
                " using the support or legal email they publish (the operator can set NEXT_PUBLIC_LEGAL_CONTACT_EMAIL)."
              )}
            </p>
          </section>

          <p className="text-xs text-(--text-muted) pt-4 border-t border-(--line)">
            <Link href="/legal/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
