import {
  buildLandingFaqJsonLd,
  buildLandingSoftwareJsonLd,
  buildLandingWebSiteJsonLd,
} from "@/lib/seo-landing";

export function LandingJsonLd() {
  const blocks = [
    buildLandingWebSiteJsonLd(),
    buildLandingSoftwareJsonLd(),
    buildLandingFaqJsonLd(),
  ];

  return (
    <>
      {blocks.map((data, i) => (
        <script
          key={`landing-ld-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  );
}
