"use client";
import React, { useMemo, useState } from "react";
import DnsOutlinedIcon from "@mui/icons-material/DnsOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutlined";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutlined";
import PauseCircleOutlineIcon from "@mui/icons-material/PauseCircleOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlined";
import StopCircleOutlinedIcon from "@mui/icons-material/StopCircleOutlined";
import { Panel } from "./Panel";
import { clampPct, formatBytes, groupProjects, STATE_LABEL, type ContainerState } from "@/app/pages/monitor/lib";
import type { DockerContainer } from "@/app/pages/monitor/types";

type Props = {
  containers: DockerContainer[];
  cores: number;
};

const STATE_ICON: Record<ContainerState, React.ReactNode> = {
  healthy: <CheckCircleOutlineIcon fontSize="inherit" />,
  running: <PlayCircleOutlineIcon fontSize="inherit" />,
  paused: <PauseCircleOutlineIcon fontSize="inherit" />,
  unhealthy: <ErrorOutlineIcon fontSize="inherit" />,
  stopped: <StopCircleOutlinedIcon fontSize="inherit" />,
};

function StateChip({ state, count }: { state: ContainerState; count?: number }) {
  return (
    <span className={`chip chip--${state}`}>
      {STATE_ICON[state]}
      {count !== undefined && <strong>{count}</strong>}
      <span>{STATE_LABEL[state]}</span>
    </span>
  );
}

function UsageBar({ kind, value, label }: { kind: "cpu" | "ram"; value: number; label: string }) {
  const v = clampPct(value);
  return (
    <span className="usage" title={`${label} ${v.toFixed(2)}%`}>
      <span className="usage__key" aria-hidden="true">{label}</span>
      <span className="bar">
        <span className={`bar__fill bar__fill--${kind}`} style={{ width: `${v}%` }} />
      </span>
      <span className="usage__val">{v.toFixed(1)}%</span>
    </span>
  );
}

export function DockerPanel({ containers, cores }: Props) {
  const projects = useMemo(() => groupProjects(containers, cores), [containers, cores]);
  const [open, setOpen] = useState<Set<string>>(new Set());

  const counts = useMemo(() => {
    const c: Record<ContainerState, number> = { healthy: 0, running: 0, paused: 0, unhealthy: 0, stopped: 0 };
    for (const p of projects) for (const r of p.containers) c[r.state]++;
    return c;
  }, [projects]);

  const allOpen = projects.length > 0 && projects.every((p) => open.has(p.name));
  const toggleAll = () => setOpen(allOpen ? new Set() : new Set(projects.map((p) => p.name)));
  const toggle = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <Panel
      title="Containers"
      subtitle={`${projects.length} projects · ${containers.length} containers`}
      icon={<DnsOutlinedIcon fontSize="inherit" />}
      actions={
        <button type="button" className="btn btn--ghost" onClick={toggleAll} disabled={projects.length === 0}>
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      }
    >
      <div className="chips" aria-label="Container states">
        {(["healthy", "running", "unhealthy", "paused", "stopped"] as ContainerState[])
          .filter((s) => counts[s] > 0)
          .map((s) => (
            <StateChip key={s} state={s} count={counts[s]} />
          ))}
        <span className="legend" aria-hidden="true">
          <span className="legend__item"><i className="swatch swatch--cpu" />CPU</span>
          <span className="legend__item"><i className="swatch swatch--ram" />RAM</span>
        </span>
      </div>

      {projects.length === 0 ? (
        <p className="muted">No containers reported.</p>
      ) : (
        <ul className="projects">
          {projects.map((p) => {
            const isOpen = open.has(p.name);
            return (
              <li key={p.name} className={`proj ${isOpen ? "proj--open" : ""}`}>
                <button
                  type="button"
                  className="proj__row"
                  aria-expanded={isOpen}
                  aria-controls={`proj-${p.name}`}
                  onClick={() => toggle(p.name)}
                >
                  <span className={`state-ico state-ico--${p.state}`} title={STATE_LABEL[p.state]}>
                    {STATE_ICON[p.state]}
                  </span>
                  <span className="proj__name">
                    {p.name}
                    <span className="proj__count">{p.containers.length}</span>
                  </span>
                  <span className="proj__bars">
                    <UsageBar kind="cpu" value={p.cpu} label="CPU" />
                    <UsageBar kind="ram" value={p.mem} label="RAM" />
                  </span>
                  <ExpandMoreIcon className="proj__chev" fontSize="small" />
                </button>

                {isOpen && (
                  <ul className="containers" id={`proj-${p.name}`}>
                    {p.containers.map((c) => (
                      <li key={c.name} className="ctr">
                        <span className={`state-ico state-ico--${c.state}`} title={STATE_LABEL[c.state]}>
                          {STATE_ICON[c.state]}
                        </span>
                        <span className="ctr__name">{c.name}</span>
                        <span className="ctr__meta">
                          <span className={`chip chip--${c.state} chip--sm`}>{STATE_LABEL[c.state]}</span>
                          {c.uptime && <span className="ctr__uptime">up {c.uptime}</span>}
                        </span>
                        <span className="ctr__usage">
                          <span><i className="swatch swatch--cpu" />{c.cpuPct.toFixed(2)}%</span>
                          <span title={c.mem_bytes !== undefined ? formatBytes(c.mem_bytes) : undefined}>
                            <i className="swatch swatch--ram" />
                            {c.memPct.toFixed(2)}%
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
