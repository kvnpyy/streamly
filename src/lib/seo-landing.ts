import {
  DEFAULT_SITE_URL,
  SITE_NAME,
  USER_CONTENT_DISCLAIMER_SHORT,
  absoluteSiteUrl,
} from "@/lib/site-brand";

export const SITE_SEO_TITLE =
  "IPTV Web Player | Streamly · Live TV, Movies & Series in Your Browser";

export const SITE_SEO_DESCRIPTION =
  "Streamly is an IPTV web player in your browser. Sign in with Xtream Codes or an M3U playlist from your provider. Live TV, movies, series. No app install. iptvwebplayer.org.";

export const SITE_SEO_KEYWORDS = [
  "IPTV web player",
  "iptv web player",
  "browser IPTV player",
  "Xtream Codes web player",
  "M3U web player",
  "self-hosted IPTV player",
  "watch IPTV in browser",
  "live TV web player",
  "Streamly",
  "iptvwebplayer",
] as const;

/** Keep H1 keyword-clear for SEO; voice lives in the subhead and sections below. */
export const LANDING_H1 = "IPTV web player for your browser";

export const LANDING_HERO_KICKER = "I was tired of five different IPTV apps";

export const LANDING_HERO_LEAD =
  "I wanted one IPTV web player I could open on my laptop, phone, and the TV browser without sideloading another APK. That's Streamly. You sign in with Xtream Codes or paste an M3U playlist from your provider. Live TV, movies, series. Same panel you already pay for, just in Chrome or Safari or whatever you already use.";

export const LANDING_HERO_ASIDE =
  "We don't sell channels. You need your own subscription. Please follow your provider's terms and the law where you live.";

export const LANDING_FEATURES_HEADING = "What you actually get";

export type LandingFeatureIcon =
  | "tv"
  | "film"
  | "link"
  | "devices"
  | "monitor"
  | "shield";

export type LandingFeature = {
  readonly title: string;
  readonly body: string;
  readonly icon: LandingFeatureIcon;
  readonly wide?: boolean;
};

export const LANDING_FEATURES: readonly LandingFeature[] = [
  {
    title: "Live TV + EPG",
    body: "Channel grid and what's on now. I probably use the guide more than I should. Still beats guessing which match is on.",
    icon: "tv",
    wide: true,
  },
  {
    title: "Movies & series",
    body: "If your Xtream panel has VOD, you get posters and categories. Not a sad text-only list.",
    icon: "film",
  },
  {
    title: "Xtream Codes & M3U",
    body: "Server URL, username, password. Or an M3U link. That's it. No extra account with us.",
    icon: "link",
  },
  {
    title: "One URL, every screen",
    body: "Bookmark iptvwebplayer.org on your phone, iPad, or PC. Same Streamly everywhere. No installs per device.",
    icon: "devices",
  },
  {
    title: "TV browser mode",
    body: "Big tiles and remote-friendly focus. I watch in a Fire TV browser sometimes, so I refused to ship tiny buttons.",
    icon: "monitor",
  },
  {
    title: "Your creds stay yours",
    body: "Streamly doesn't sell playlists. Logins stay on your device. We proxy streams so HLS actually plays in the browser without CORS nonsense.",
    icon: "shield",
  },
];

export const LANDING_STEPS_HEADING = "Three steps, no app store";

export const LANDING_STEPS = [
  {
    step: "1",
    title: "Open & sign in",
    body: "Go to iptvwebplayer.org. Enter your Xtream server or M3U URL. Quick if you already have the details saved somewhere.",
  },
  {
    step: "2",
    title: "Browse your panel",
    body: "Live, movies, series. Whatever your provider exposes. Feels close to their native app, except it's a tab.",
  },
  {
    step: "3",
    title: "Press play",
    body: "HLS in the browser. No APK. No lecture from your roommate about unknown sources.",
  },
] as const;

export const LANDING_COMPARE_HEADING = "Not another reseller portal";

export const LANDING_COMPARE_LEAD =
  "Search for IPTV web player and you get a lot of white-label sites for resellers. Streamly isn't that. I made it for people who already have a sub and want a simple browser player. Not a business-in-a-box.";

export const LANDING_COMPARE_CARDS = [
  {
    title: "You, not a reseller",
    body: "Use the login your provider gave you. Watch at iptvwebplayer.org. I'm not selling you a panel.",
    icon: "user" as const,
  },
  {
    title: "Real Xtream browsing",
    body: "Categories, EPG, movies, series. Not a flat M3U dump with no metadata. If your panel has it, Streamly tries to show it right.",
    icon: "grid" as const,
  },
] as const;

export const LANDING_GUIDES_HEADING = "If you want to go deeper";

export const LANDING_FAQ_HEADING = "Stuff people ask";

export const LANDING_CTA_HEADING = "Try the player";

export const LANDING_CTA_LEAD =
  "Free at iptvwebplayer.org. Bring your Xtream login or M3U playlist. I kept the UI quiet so you can watch.";

export const LANDING_FAQ = [
  {
    question: "What's an IPTV web player?",
    answer:
      "A site that plays your provider's streams in the browser. Live TV, movies, series. You use your login or M3U playlist. No app on every device. Streamly is built for Xtream Codes panels and normal M3U links.",
  },
  {
    question: "Does Streamly sell channels?",
    answer: `No. ${USER_CONTENT_DISCLAIMER_SHORT}`,
  },
  {
    question: "Will my provider work?",
    answer:
      "Usually yes if they give you Xtream Codes (server, username, password) or a standard M3U/M3U8 URL. You still need an active subscription with them. I can't fix that part.",
  },
  {
    question: "Do I need to install anything?",
    answer:
      "Nope. Browser only. Bookmark it on your phone, tablet, laptop, or TV browser. That's the point.",
  },
  {
    question: "Which browsers?",
    answer:
      "Chrome, Edge, Brave, Safari, Firefox. Recent versions. Playback depends on what your provider sends, usually HLS. I've spent too long on live playback in Windows Chrome. Safari on Mac is often smoother. Your mileage may vary.",
  },
  {
    question: "Can I self-host?",
    answer:
      "Yes. Docker on your own VPS if you want a self-hosted IPTV player. I posted my Compose setup on the blog. Or just use iptvwebplayer.org if you don't want to run it yourself.",
  },
  {
    question: "Is there a community or support chat?",
    answer:
      "Yes — join the official Streamly Discord (discord.gg/QGFKJt9t7A) for setup help, release notes, and chat. Share feature ideas in GitHub Discussions (Feedback & Ideas) without opening an issue. Email is still best for account, privacy, and legal requests. Links are in the site footer or Settings.",
  },
] as const;

export function buildLandingFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: LANDING_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export function buildLandingSoftwareJsonLd() {
  const url = absoluteSiteUrl("/");
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: ["IPTV Web Player", "iptvwebplayer"],
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    description:
      "Streamly is a browser IPTV web player for Xtream Codes and M3U playlists. Live TV, movies, series, and EPG. Bring your own subscription.",
    url,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: LANDING_FEATURES.map((f) => f.title).join(", "),
    isAccessibleForFree: true,
  };
}

export function buildLandingWebSiteJsonLd() {
  const origin = DEFAULT_SITE_URL.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "IPTV Web Player | Streamly",
    alternateName: SITE_NAME,
    url: origin,
    description:
      "Streamly. IPTV web player for Xtream Codes and M3U playlists in your browser.",
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/login`,
      name: "Open IPTV web player sign in",
    },
  };
}
