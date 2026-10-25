## ABOUT

A proof of concept for a private Nextcloud extension: a system monitor that reads
a set of JSON log files and renders CPU/RAM/disk usage, running Docker containers,
and SSH login/attack activity.

It provides:

- a Nextcloud custom app (`nextcloud/custom_apps/system_monitor`) that embeds the monitor
- a Next.js UI at `/bookmarks/pages/monitor` reading JSON files from `WATCH_DIR` (default `/var/www/html`)

The log files themselves (`system.json`, `docker.json`, `access.json`) are produced by a
separate, private tool that is **not included** in this repo. This project only
demonstrates how to consume and render them.

The monitor is the only view: `/bookmarks` and any unknown path redirect to it. The
only API route is `/bookmarks/api/report`, which the dashboard polls.

This is a [next.js](https://nextjs.org/) project created with [create-next-app](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

Created and tested using `node@22.12`, `npm@11.2.0` and `docker@26.0.1`.

## SETUP

Copy `.env.local` to `.env` and write your actual values. Optional `WATCH_DIR`
points at the folder containing the JSON reports (default `/var/www/html`).

## DEVELOP

`npm run dev` loads `.env.development`, which points `WATCH_DIR` at the sample
reports in `./mock`. Run the simulator in a second terminal to see live values:

```bash
npm run mock
```

Then open [http://localhost:3000/bookmarks/pages/monitor](http://localhost:3000/bookmarks/pages/monitor).
To develop against real data instead: `WATCH_DIR=/var/www/html npm run dev`.

The UI polls `/api/report?since=<ms>`; the server only returns files modified
after `since`, so a new tab receives the full snapshot and then only deltas.

## RUN

Select your preferred method:

#### NPM

Run the UI using node:

```bash
git clone git@github.com:JorgeMartinezPizarro/system-monitor.git
copy .env system-monitor/.env
cd system-monitor
npm install
npm run start
```

#### DOCKER

```bash
git clone git@github.com:JorgeMartinezPizarro/system-monitor.git
copy .env system-monitor/.env
cd system-monitor
docker compose up -d
```

Navigate to [http://localhost:3000/bookmarks](http://localhost:3000/bookmarks) to start using the app.

## BUILD

```bash
docker build -t jorgemartinezpizarro/system-monitor:latest .
docker push jorgemartinezpizarro/system-monitor:latest
```

Change `jorgemartinezpizarro/system-monitor` to your own Docker Hub namespace.

## NOTE

It is required to link the app with a valid Nextcloud URL, otherwise the app will not work.
