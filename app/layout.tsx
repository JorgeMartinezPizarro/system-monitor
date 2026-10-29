import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "System monitor",
  description: "CPU, memory, disk, Docker containers and SSH activity at a glance.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
    { media: "(prefers-color-scheme: light)", color: "#f3f3f0" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* With the session cookie: nginx rejects requests without it (see app/app.webmanifest/route.ts). */}
        <link rel="manifest" href="/bookmarks/app.webmanifest" crossOrigin="use-credentials" />
        <link rel="apple-touch-icon" href="/bookmarks/icons/icon-180.png" sizes="180x180" />
      </head>
      <body>{children}</body>
    </html>
  );
}
