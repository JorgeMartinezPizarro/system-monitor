#!/bin/bash
# collect.sh — entrypoint of the collector image: keeps the JSON reports that the UI reads fresh.
#
#   collect.sh        loop (container default): the 3 generators run in the background, each at its own pace
#   collect.sh once   run the 3 generators once, in parallel, print timings, exit 1 if any failed
#
# Output in OUT_DIR (a volume shared with the UI, which mounts it read-only), each file written atomically:
#   system.json (system.sh)  access.json (ssh.sh)  docker.json (docker.sh)  status.json (last run of each)
# Intervals in seconds: MONITOR_SYSTEM, MONITOR_SSH, MONITOR_DOCKER.
# The loop only logs start, failures and recoveries (not every run), so `docker logs` stays small.
set -uo pipefail

MODE="${1:-loop}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${OUT_DIR:-/reports}"
MONITOR_SYSTEM="${MONITOR_SYSTEM:-1}"
MONITOR_SSH="${MONITOR_SSH:-1}"
MONITOR_DOCKER="${MONITOR_DOCKER:-1}"

GENERATORS="system ssh docker"
STATE="${STATE_DIR:-/tmp/collector}"          # per-generator state + last error (tmpfs, never shared)
mkdir -p "$STATE"

interval_of() { case "$1" in system) echo "$MONITOR_SYSTEM";; ssh) echo "$MONITOR_SSH";; docker) echo "$MONITOR_DOCKER";; esac; }
file_of()     { case "$1" in system) echo system.json;; ssh) echo access.json;; docker) echo docker.json;; esac; }

# ------------------------------------------------------------------ status.json (atomic, built from fragments)
write_status() {
  local tmp="$OUT_DIR/.status.json.tmp" g sep=""
  {
    printf '{\n  "updated": "%s",\n  "generators": {\n' "$(date -Iseconds)"
    for g in $GENERATORS; do
      if [ -f "$STATE/$g.state" ]; then
        # state line: last_run|duration|ok|next
        IFS='|' read -r last dur ok next < "$STATE/$g.state"
      else last=""; dur=0; ok=false; next="$(interval_of "$g")"; fi
      printf '%s    "%s": {"file": "%s", "last_run": "%s", "duration_s": %s, "ok": %s, "interval_s": %s}' \
        "$sep" "$g" "$(file_of "$g")" "$last" "$dur" "$ok" "$next"
      sep=$',\n'
    done
    printf '\n  }\n}\n'
  } > "$tmp" && mv -f "$tmp" "$OUT_DIR/status.json"
}

# ------------------------------------------------------------------ one run of one generator
run_one() { # run_one name [verbose]  -> updates the report + state, returns the generator's exit code
  local g="$1" verbose="${2:-}" out tmp err t0 t1 dur rc okj prev
  out="$OUT_DIR/$(file_of "$g")"; tmp="$OUT_DIR/.$(file_of "$g").tmp"; err="$STATE/$g.err"
  t0="$(date +%s.%N)"
  bash "$HERE/$g.sh" > "$tmp" 2> "$err"; rc=$?
  # the UI must never read a half-written or empty file: replace only on success
  if [ "$rc" = 0 ] && [ -s "$tmp" ]; then mv -f "$tmp" "$out"; else rm -f "$tmp"; [ "$rc" = 0 ] && rc=1; fi
  t1="$(date +%s.%N)"
  dur="$(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.1f", b-a}')"
  [ "$rc" = 0 ] && okj=true || okj=false
  prev="$(cut -d'|' -f3 "$STATE/$g.state" 2>/dev/null)"
  printf '%s|%s|%s|%s\n' "$(date -Iseconds)" "$dur" "$okj" "$(interval_of "$g")" > "$STATE/$g.state"
  ( flock -w 5 9 && write_status ) 9>"$STATE/status.lock"
  if [ "$rc" != 0 ]; then
    [ "$prev" != false ] || [ -n "$verbose" ] && \
      printf '%s  %-7s %6ss  FAIL  rc=%s  %s\n' "$(date +%T)" "$g" "$dur" "$rc" "$(tail -1 "$err" | cut -c1-100)"
  elif [ -n "$verbose" ]; then
    printf '%s  %-7s %6ss  ok\n' "$(date +%T)" "$g" "$dur"
  elif [ "$prev" = false ]; then
    printf '%s  %-7s %6ss  ok again\n' "$(date +%T)" "$g" "$dur"
  fi
  return "$rc"
}

# ------------------------------------------------------------------ modes
once() {
  local g pids=() rc=0 i
  echo "reports -> $OUT_DIR"
  for g in $GENERATORS; do run_one "$g" verbose & pids+=($!); done
  for i in "${!pids[@]}"; do wait "${pids[$i]}" || rc=1; done
  return "$rc"
}

worker() { # worker name  -> run forever at its interval
  local g="$1"
  while :; do run_one "$g"; sleep "$(interval_of "$g")"; done
}

loop() {
  local g pids=()
  echo "collector -> $OUT_DIR   intervals: system ${MONITOR_SYSTEM}s  ssh ${MONITOR_SSH}s  docker ${MONITOR_DOCKER}s"
  # docker stop / Ctrl-C: stop the workers and whatever generator they were running at that moment
  trap 'for p in "${pids[@]}"; do pkill -TERM -P "$p" 2>/dev/null; kill "$p" 2>/dev/null; done; wait; exit 0' INT TERM
  for g in $GENERATORS; do worker "$g" & pids+=($!); done
  wait
}

case "$MODE" in
  loop) loop ;;
  once) once ;;
  *) echo "usage: $0 [loop|once]"; exit 2 ;;
esac
