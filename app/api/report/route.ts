import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { AuthError, authDisabled, requireAuth } from "@/app/lib/auth";

// Directory where the collector writes system.json, docker.json, access.json, status.json (mounted read-only).
const WATCH_DIR = process.env.WATCH_DIR || "/reports";

/**
 * GET /api/report?since=<ms>
 *
 * Returns every *.json file in WATCH_DIR modified after `since` (a Unix
 * timestamp in milliseconds supplied by the client). The client keeps the
 * newest timestamp it has seen and sends it back, so each browser tab gets
 * the full snapshot on its first request and only deltas afterwards.
 */
export async function GET(req: Request) {
  if (!authDisabled()) {
    try {
      await requireAuth(req);
    } catch (err) {
      if (!(err instanceof AuthError)) console.error(err);
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;

    const files = (await fs.readdir(/*turbopackIgnore: true*/ WATCH_DIR)).filter((f) => f.endsWith(".json"));

    let newest = since;
    const data: Record<string, { timestamp: number; content: unknown }> = {};

    for (const file of files) {
      const fullPath = path.join(/*turbopackIgnore: true*/ WATCH_DIR, file);
      const stats = await fs.stat(/*turbopackIgnore: true*/ fullPath);
      if (stats.mtimeMs <= since) continue;

      try {
        const content = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ fullPath, "utf8"));
        data[file] = { timestamp: stats.mtimeMs, content };
        newest = Math.max(newest, stats.mtimeMs);
      } catch {
        // The producer may be mid-write; skip this file and pick it up next poll.
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ changed: false, timestamp: since });
    }

    return NextResponse.json({ changed: true, timestamp: newest, data });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Error reading files" }, { status: 500 });
  }
}
