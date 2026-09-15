import githubSvg from "simple-icons/icons/github.svg?raw";
import notionSvg from "simple-icons/icons/notion.svg?raw";
import gmailSvg from "simple-icons/icons/gmail.svg?raw";
import googleCalendarSvg from "simple-icons/icons/googlecalendar.svg?raw";
import braveSvg from "simple-icons/icons/brave.svg?raw";
import puppeteerSvg from "simple-icons/icons/puppeteer.svg?raw";

// Official brand marks, pulled from simple-icons so the path data matches
// each brand's current logo instead of a hand-drawn approximation. Slack has
// no icon in simple-icons (removed at Slack's request over trademark use),
// so it falls back to a generic glyph below instead of a fake brand mark.
const BRAND_SVGS: Record<string, string> = {
  github: githubSvg,
  notion: notionSvg,
  gmail: gmailSvg,
  "google-calendar": googleCalendarSvg,
  brave: braveSvg,
  puppeteer: puppeteerSvg,
};

function extractPath(svg: string): string {
  return svg.match(/<path d="([^"]+)"/)?.[1] ?? "";
}

const BRAND_PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(BRAND_SVGS).map(([id, svg]) => [id, extractPath(svg)]),
);

// Generic (non-brand) glyphs for presets without an official logo.
const GENERIC_PATHS: Record<string, string> = {
  slack:
    "M7 2a2 2 0 0 0-2 2v5a2 2 0 1 0 4 0V4a2 2 0 0 0-2-2zm10 13a2 2 0 0 0 2-2v-5a2 2 0 1 0-4 0v5a2 2 0 0 0 2 2zM4 13a2 2 0 1 0 0 4h5a2 2 0 1 0 0-4H4zm11-6a2 2 0 1 0 0-4H10a2 2 0 1 0 0 4h5z",
  folder:
    "M3 4a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4z",
  brain:
    "M9.5 2A3.5 3.5 0 0 0 6 5.5v.086A3.5 3.5 0 0 0 4 9v1a3.5 3.5 0 0 0 1 2.45V15a4 4 0 0 0 4 4h.5a1 1 0 0 0 1-1V4.5A2.5 2.5 0 0 0 9.5 2zm5 0A2.5 2.5 0 0 0 12 4.5V18a1 1 0 0 0 1 1h.5a4 4 0 0 0 4-4v-2.55A3.5 3.5 0 0 0 19 9V8a3.5 3.5 0 0 0-2-3.414V4.5A3.5 3.5 0 0 0 14.5 2z",
};

export type IconName = keyof typeof BRAND_SVGS | keyof typeof GENERIC_PATHS;

interface BrandIconProps {
  name: IconName;
  className?: string;
}

export function BrandIcon({ name, className }: BrandIconProps) {
  const d = BRAND_PATHS[name] ?? GENERIC_PATHS[name];
  if (!d) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}
