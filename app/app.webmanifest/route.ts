import type { MetadataRoute } from "next";

/**
 * Web app manifest, so browsers offer to install the monitor as an app.
 * Not Next's app/manifest.ts convention: its <link> is fetched without cookies, and nginx only lets requests
 * with the Nextcloud session cookie through. app/layout.tsx links this file with crossOrigin="use-credentials".
 * URLs are relative to this file (/bookmarks/app.webmanifest), so the basePath is not repeated here.
 */
export const dynamic = "force-static";

const manifest: MetadataRoute.Manifest = {
  name: "System monitor",
  short_name: "Monitor",
  description: "CPU, memory, disk, Docker containers and SSH activity at a glance.",
  start_url: "pages/monitor",
  scope: "./",
  display: "standalone",
  background_color: "#161616",
  theme_color: "#161616",
  icons: [
    { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
};

export function GET() {
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
