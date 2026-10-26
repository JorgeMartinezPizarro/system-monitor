#!/bin/sh
# docker.sh — docker.json: running containers with status, cpu and memory.
# The docker CLI talks to the host daemon through the mounted /var/run/docker.sock (read-only use: ps, stats).
#
# Memory: `docker stats` counts every page-cache page a container touched as its memory (a model file mapped
# with mmap, a database's file cache), while system.json counts that cache as available, like `free` and btop
# do. The two figures did not add up: a container could show 48% of the host while the host showed 30% in use.
# So each container is measured from its cgroup with the host's rule: memory.current minus the reclaimable
# page cache (file - shmem) and minus the reclaimable slab. That needs the host cgroup tree mounted read-only at
# CGROUP_ROOT; when a container's cgroup is not found there, its `docker stats` figure is kept.
# "memory" is a share of the host RAM (MemTotal); "mem_bytes" is only present when measured from the cgroup.

CGROUP_ROOT="${CGROUP_ROOT:-/host/cgroup}"
MEM_TOTAL_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
TAB=$(printf '\t')

# Archivos temporales (/tmp is a tmpfs in the container)
INFO=$(mktemp)
STATS=$(mktemp)
MEM=$(mktemp)
trap 'rm -f "$INFO" "$STATS" "$MEM"' EXIT

# Extraer información. Both lists are joined by container name, never by line position: a container that
# starts or stops between the two commands must not shift the figures onto its neighbours.
docker ps --no-trunc --format "{{.ID}}\t{{.Names}}\t{{.Status}}" > "$INFO" || exit 1
docker stats --no-stream --format "{{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}" > "$STATS" || exit 1

# Memoria sin caché, por contenedor: name<TAB>bytes
# cgroup v2 paths: systemd driver (Debian default) or cgroupfs driver.
while IFS="$TAB" read -r id name status; do
    dir="$CGROUP_ROOT/system.slice/docker-$id.scope"
    [ -d "$dir" ] || dir="$CGROUP_ROOT/docker/$id"
    [ -r "$dir/memory.current" ] && [ -r "$dir/memory.stat" ] || continue
    awk -v name="$name" -v cur="$(cat "$dir/memory.current")" '
        $1 == "file" { file = $2 }
        $1 == "shmem" { shmem = $2 }
        $1 == "slab_reclaimable" { slab = $2 }
        END {
            used = cur - (file - shmem) - slab
            if (used < 0) used = 0
            printf "%s\t%.0f\n", name, used
        }' "$dir/memory.stat"
done < "$INFO" > "$MEM"

# Combinar y convertir en JSON (in `docker ps` order)
awk -F'\t' -v total_kb="$MEM_TOTAL_KB" '
    FILENAME == ARGV[1] { cpu[$1] = $2; memperc[$1] = $3; next }
    FILENAME == ARGV[2] { bytes[$1] = $2; next }
    {
        name = $2; status = $3
        if (name in bytes && total_kb > 0) {
            mem = sprintf("%.2f%%", bytes[name] / (total_kb * 1024) * 100)
            extra = sprintf(", \"mem_bytes\":%s", bytes[name])
        } else {
            mem = (name in memperc) ? memperc[name] : "0.00%"
            extra = ""
        }
        c = (name in cpu) ? cpu[name] : "0.00%"
        if (n++) printf ",\n"
        printf "  {\"name\":\"%s\", \"status\":\"%s\", \"cpu\":\"%s\", \"memory\":\"%s\"%s}", name, status, c, mem, extra
    }
    BEGIN { print "[" }
    END { print "\n]" }
' "$STATS" "$MEM" "$INFO"
