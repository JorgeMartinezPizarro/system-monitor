import { ImageResponse } from "next/og";

/**
 * Raster app icon for the web app manifest and iOS (PNG, any size), drawn from the same pulse line as
 * app/icon.svg. Full-bleed square on purpose: the platform applies its own mask, and the line stays inside the
 * maskable safe zone (the centred circle of 80% diameter), so one image serves as "any" and "maskable".
 */
const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
  '<rect width="32" height="32" fill="#222322"/>' +
  '<polyline points="5,17 11,17 14,9 18,24 21,14 23,17 27,17" fill="none" stroke="#3987e5" ' +
  'stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const SRC = `data:image/svg+xml;base64,${Buffer.from(SVG).toString("base64")}`;

export function appIcon(size: number): ImageResponse {
  return new ImageResponse(
    // eslint-disable-next-line @next/next/no-img-element
    <img src={SRC} width={size} height={size} alt="" />,
    { width: size, height: size },
  );
}
