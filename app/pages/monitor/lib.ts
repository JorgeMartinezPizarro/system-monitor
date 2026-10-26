import type { AccessReport, DockerContainer, IpCount } from "./types";

/* ---------- severity (resource meters) ---------- */

export type Severity = "good" | "warning" | "critical";

export function severity(pct: number): Severity {
  if (pct >= 90) return "critical";
  if (pct >= 75) return "warning";
  return "good";
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  good: "Normal",
  warning: "High",
  critical: "Critical",
};

export const clampPct = (v: number) => Math.min(100, Math.max(0, Number.isFinite(v) ? v : 0));

/**
 * Parses a percentage that the producer may write as a number (45.2) or as a
 * string ("45.2", "45.2%", "45,2 %"). Returns null when there is no usable value,
 * so the UI can show "no data" instead of a misleading 0.
 */
export function toPct(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = parseFloat(v.replace("%", "").replace(",", ".").trim());
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** "4.21%" -> 4.21, anything unparseable -> 0 (for per-container sums). */
export const pct = (s?: string | number) => toPct(s) ?? 0;

/* ---------- docker ---------- */

export type ContainerState = "healthy" | "running" | "paused" | "unhealthy" | "stopped";

export const STATE_LABEL: Record<ContainerState, string> = {
  healthy: "Healthy",
  running: "Running",
  paused: "Paused",
  unhealthy: "Unhealthy",
  stopped: "Stopped",
};

/** Higher = worse; used to pick a project's overall state. */
const STATE_RANK: Record<ContainerState, number> = {
  healthy: 0,
  running: 1,
  paused: 2,
  stopped: 3,
  unhealthy: 4,
};

export function parseStatus(status: string | undefined): { state: ContainerState; uptime: string } {
  const raw = status ?? "";
  const lower = raw.toLowerCase();
  let state: ContainerState = "running";
  if (lower.includes("unhealthy")) state = "unhealthy";
  else if (lower.includes("healthy")) state = "healthy";
  else if (lower.includes("paused")) state = "paused";
  else if (!lower.startsWith("up")) state = "stopped";

  const uptime = raw
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/^up\s+/i, "")
    .trim();
  return { state, uptime: uptime || raw };
}

export type ContainerRow = DockerContainer & {
  state: ContainerState;
  uptime: string;
  cpuPct: number;
  memPct: number;
};

export type Project = {
  name: string;
  containers: ContainerRow[];
  /** Share of the whole host CPU (sum of container % divided by core count). */
  cpu: number;
  mem: number;
  state: ContainerState;
};

export function groupProjects(containers: DockerContainer[], cores: number): Project[] {
  const byName = new Map<string, ContainerRow[]>();
  for (const c of containers) {
    const key = (c.name ?? "").split("-")[0] || c.name || "unknown";
    const { state, uptime } = parseStatus(c.status);
    const row: ContainerRow = { ...c, state, uptime, cpuPct: pct(c.cpu), memPct: pct(c.memory) };
    const list = byName.get(key);
    if (list) list.push(row);
    else byName.set(key, [row]);
  }

  const safeCores = Math.max(1, cores || 1);
  return [...byName.entries()]
    .map(([name, rows]) => ({
      name,
      containers: rows.sort((a, b) => a.name.localeCompare(b.name)),
      cpu: rows.reduce((acc, r) => acc + r.cpuPct, 0) / safeCores,
      mem: rows.reduce((acc, r) => acc + r.memPct, 0),
      state: rows.reduce<ContainerState>(
        (worst, r) => (STATE_RANK[r.state] > STATE_RANK[worst] ? r.state : worst),
        "healthy",
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- ssh access ---------- */

export type AccessSummary = {
  logins: IpCount[];
  attackers: IpCount[];
  banned: string[];
  totalFailed: number;
  totalLogins: number;
};

export function summarizeAccess(access: AccessReport | undefined): AccessSummary {
  const banned = access?.banned_ips ?? [];
  const bannedSet = new Set(banned);
  const fails = access?.fails ?? [];
  const logins = [...(access?.login ?? [])].sort((a, b) => b.count - a.count);
  const attackers = fails.filter((f) => !bannedSet.has(f.ip)).sort((a, b) => b.count - a.count);
  return {
    logins,
    attackers,
    banned,
    totalFailed: fails.reduce((acc, f) => acc + (f.count || 0), 0),
    totalLogins: logins.reduce((acc, l) => acc + (l.count || 0), 0),
  };
}

/** The script is pasted into a root shell: only plain IPv4 addresses make it in, whatever the report says. */
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function banScript(ips: string[]): string {
  return ips.filter((ip) => IPV4.test(ip)).map((ip) => `iptables -A INPUT -s ${ip} -j DROP`).join(" && ");
}

/* ---------- formatting ---------- */

export function relativeTime(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 2) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact" }).format(n);
