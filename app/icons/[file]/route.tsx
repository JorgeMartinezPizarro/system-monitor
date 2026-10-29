import { appIcon } from "@/app/lib/appIcon";

/**
 * PNG icons, rendered once at build time: 192 and 512 for the web app manifest, 180 for iOS (apple-touch-icon,
 * linked from app/layout.tsx: Next's apple-icon convention drops the basePath from its link).
 */
const SIZES: Record<string, number> = { "icon-180.png": 180, "icon-192.png": 192, "icon-512.png": 512 };

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(SIZES).map((file) => ({ file }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const size = SIZES[(await params).file];
  if (!size) return new Response("Not found", { status: 404 });
  return appIcon(size);
}
