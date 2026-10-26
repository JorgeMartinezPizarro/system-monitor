## ABOUT

A system monitor for a Nextcloud host: CPU/RAM/disk usage, running Docker containers, and SSH login/attack
activity. The repo builds two Docker images that only share a folder of JSON reports:

| Image | Source | Role | Privileges |
|---|---|---|---|
| `system-monitor` | repo root (Next.js) | the UI at `/bookmarks/pages/monitor`, reads the reports from `WATCH_DIR` (`/reports`, read-only) | none: user `node`, no capabilities, read-only filesystem, no host paths |
| `system-monitor-collector` | `collector/` (bash) | writes `system.json`, `access.json`, `docker.json`, `status.json` into `/reports` | docker socket, host journal (read-only), `NET_ADMIN` + host network to read the firewall rules; listens on nothing |

The privileged half never serves anything and the half that faces the internet holds nothing privileged.

It also provides a Nextcloud custom app (`nextcloud/custom_apps/system_monitor`) that embeds the monitor.

The monitor is the only view: `/bookmarks` and any unknown path redirect to it. The only API route is
`/bookmarks/api/report`, which the dashboard polls.

### Access

Every page (`proxy.ts`) and every API call (`app/api/report`) is checked against Nextcloud (`app/lib/auth.ts`):
the request's cookies are sent to `NEXTCLOUD_URL/ocs/v2.php/cloud/user` and the user must belong to the group
`MONITOR_GROUP` (default `admin`). No session, an expired one, or a user outside the group: the page redirects
to the Nextcloud login and the API answers 401. Successful checks are cached for 60 s per cookie.

- `NEXTCLOUD_URL` must be the host that serves the monitor: the browser only sends that host's cookies.
- The check is always on. The only switch is `MONITOR_AUTH=off`, read at runtime, set only by
  `.env.development` for `npm run dev`. It is not a `NEXT_PUBLIC_` variable on purpose: `next build` inlines those,
  so a value present at build time would end up baked into the image. For the same reason `.dockerignore`
  keeps every `.env*` out of the build.

### Collector

`collector/collect.sh` runs `system.sh`, `ssh.sh` and `docker.sh` in a loop, each at its own interval
(`MONITOR_SYSTEM`, `MONITOR_SSH`, `MONITOR_DOCKER`, seconds), and writes every file atomically (temp file +
rename, replaced only on success). It logs its start line, failures and recoveries, not every run.
`collect.sh once` runs the three once with timings. Inside the container:

- `/proc` already shows the host cpu, memory and load; the disk is measured on the reports mount (`DISK_PATH`).
- `ssh.sh` reads the host journal (`/var/log/journal` + `/etc/machine-id`, read-only), or `/var/log/auth.log` if
  mounted, and `iptables -L` for the banned IPs. Only tokens made of IP characters reach `access.json`: the log
  lines carry attacker-controlled text, and the UI turns those IPs into a ban script (`banScript`, which in
  turn only accepts plain IPv4 addresses).
- `docker.sh` uses the docker CLI on the mounted `/var/run/docker.sock` (`ps`, `stats`) and measures each
  container's memory from the host cgroup tree (`/sys/fs/cgroup` mounted read-only at `/host/cgroup`), without
  the reclaimable page cache, so it is a share of the host RAM measured like `free` measures `system.json`.
  `docker stats` would count a memory-mapped file as the container's memory, and the containers would add up to
  more than the host total. Without the mount it falls back to the `docker stats` figure.

## DEVELOP

`npm run dev` loads `.env.development`: sample reports in `./mock`, no Nextcloud check. Run the simulator in a
second terminal to see live values:

```bash
npm run mock
```

Then open [http://localhost:3000/bookmarks/pages/monitor](http://localhost:3000/bookmarks/pages/monitor).
To develop against real data instead: `WATCH_DIR=/srv/ideniox/monitor/reports npm run dev`.

The UI polls `/api/report?since=<ms>`; the server only returns files modified after `since`, so a new tab
receives the full snapshot and then only deltas.

## RUN

Production runs both images from the ideniox repo (`stacks/monitor`, `make start-monitor`). On its own:

```bash
git clone git@github.com:JorgeMartinezPizarro/system-monitor.git
cd system-monitor
cp .env.example .env        # NEXTCLOUD_URL, MONITOR_GROUP, PORT, REPORTS_DIR
docker compose up -d --build
```

The UI listens on `127.0.0.1:${PORT}` only: put a reverse proxy in front.

## BUILD

```bash
docker build -t jorgemartinezpizarro/system-monitor:latest .
docker build -t jorgemartinezpizarro/system-monitor-collector:latest collector
docker push jorgemartinezpizarro/system-monitor:latest
docker push jorgemartinezpizarro/system-monitor-collector:latest
```

From ideniox: `make build-monitor push-monitor` (clones this repo, builds and tags both, pushes both).
Change `jorgemartinezpizarro` to your own Docker Hub namespace.
