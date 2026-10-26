/**
 * Shapes of the JSON reports written by the collector (collector/*.sh).
 * Every field is optional on purpose: the UI must degrade gracefully when a
 * file is missing or a field is absent.
 */

export type SystemReport = {
  model?: string;
  resources?: { cpu?: { cores?: number } };
  /** Percentages; the producer may write them as numbers or strings ("45.2%"). */
  summary?: { cpu_usage?: number | string; ram_usage?: number | string; disk_usage?: number | string };
};

export type DockerContainer = {
  name: string;
  /** e.g. "Up 3 days (healthy)", "Up 5 minutes (unhealthy)", "Up 2 hours (Paused)" */
  status: string;
  /** Percent string as printed by `docker stats`, e.g. "4.21%": one core = 100%. */
  cpu?: string;
  /** Share of the host RAM without reclaimable page cache, e.g. "6.75%" (same rule as summary.ram_usage). */
  memory?: string;
  /** Bytes behind `memory`, when the collector measured it from the container cgroup. */
  mem_bytes?: number;
};

export type IpCount = { ip: string; count: number };

export type AccessReport = {
  login?: IpCount[];
  fails?: IpCount[];
  banned_ips?: string[];
};
