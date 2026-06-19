import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";

export type TvPlatformId = "samsung" | "lg" | "firetv" | "androidtv";

export type TvInstallStep = {
  title: string;
  body: string;
};

export type TvPlatformGuide = {
  id: TvPlatformId;
  label: string;
  browser: string;
  steps: readonly TvInstallStep[];
};

const LOGIN_PATH = "/login";

export function tvLoginUrl(origin?: string): string {
  if (origin) return `${origin.replace(/\/$/, "")}${LOGIN_PATH}`;
  return absoluteSiteUrl(LOGIN_PATH);
}

export function tvInstallUrl(origin?: string): string {
  if (origin) return `${origin.replace(/\/$/, "")}/tv`;
  return absoluteSiteUrl("/tv");
}

export const TV_PLATFORM_GUIDES: readonly TvPlatformGuide[] = [
  {
    id: "samsung",
    label: "Samsung TV",
    browser: "Samsung Internet",
    steps: [
      {
        title: "Open the browser",
        body: "Press Home on your remote → Apps → Samsung Internet (or Internet).",
      },
      {
        title: "Go to Streamly",
        body: `Type the URL shown on your phone, or scan the QR code. Bookmark the page for quick access.`,
      },
      {
        title: "Sign in with PIN",
        body: `On your phone or laptop, open ${SITE_NAME} Settings → Generate TV code. On the TV, choose Sign in → Link with PIN and enter the 6-digit code.`,
      },
      {
        title: "Optional: pin to Home",
        body: "In Samsung Internet, open the menu → Add page to → Home screen.",
      },
    ],
  },
  {
    id: "lg",
    label: "LG TV",
    browser: "LG Browser",
    steps: [
      {
        title: "Open the browser",
        body: "Press Home → LG Content Store is not required — open the Browser app from the app row.",
      },
      {
        title: "Go to Streamly",
        body: "Enter the URL from the QR code or type it with the on-screen keyboard.",
      },
      {
        title: "Sign in with PIN",
        body: "Generate a code on your phone (Settings → Link a TV), then on the TV open Sign in → Link with PIN.",
      },
      {
        title: "Optional: add to Home",
        body: "Browser menu → Add to Home Screen for one-click launch next time.",
      },
    ],
  },
  {
    id: "firetv",
    label: "Fire TV",
    browser: "Amazon Silk",
    steps: [
      {
        title: "Open Silk",
        body: "From the Fire TV home screen, open the Silk browser (install from Amazon Appstore if needed).",
      },
      {
        title: "Go to Streamly",
        body: "Use the QR code from your phone or type the URL carefully — the remote keyboard is slow.",
      },
      {
        title: "Sign in with PIN",
        body: "PIN pairing is the easiest path on Fire TV. Avoid typing long passwords on the remote.",
      },
      {
        title: "Optional: bookmark",
        body: "Silk → Bookmarks → add this page. Fire TV remembers it across sessions.",
      },
    ],
  },
  {
    id: "androidtv",
    label: "Android TV / Google TV",
    browser: "Chrome or PWA",
    steps: [
      {
        title: "Open Chrome",
        body: "On Google TV or Android TV, open Chrome from the apps row (install from Play Store if missing).",
      },
      {
        title: "Go to Streamly",
        body: "Scan the QR code or enter the URL. Self-hosters should use their own instance URL.",
      },
      {
        title: "Add to Home (optional)",
        body: "Chrome menu → Add to Home screen. Streamly ships a web app manifest for a standalone icon.",
      },
      {
        title: "Sign in with PIN",
        body: "Same PIN flow as other TVs — generate on desktop, redeem on the TV login screen.",
      },
    ],
  },
] as const;

export const TV_INSTALL_HEADLINE = `Watch ${SITE_NAME} on your Smart TV`;

export const TV_INSTALL_LEAD =
  "No app store required to start. Open Streamly in your TV browser, then link your account with a 6-digit PIN from your phone or laptop.";

export const TV_INSTALL_PIN_STEPS: readonly TvInstallStep[] = [
  {
    title: "Sign in on your phone or computer",
    body: `Open ${SITE_NAME} in a normal browser and connect your IPTV provider (Xtream or M3U).`,
  },
  {
    title: "Generate a TV code",
    body: "Settings → Link a TV with a PIN → Generate TV code. The code expires in 10 minutes.",
  },
  {
    title: "Enter the code on your TV",
    body: "On the TV, open Sign in → Link with PIN, type the 6 digits, and press Continue.",
  },
] as const;
