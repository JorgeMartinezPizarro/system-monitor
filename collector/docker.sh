#!/bin/sh
# docker.sh — docker.json: running containers with status, cpu and memory.
# The docker CLI talks to the host daemon through the mounted /var/run/docker.sock (read-only use: ps, stats).

# Archivos temporales (/tmp is a tmpfs in the container)
INFO=$(mktemp)
STATS=$(mktemp)
trap 'rm -f "$INFO" "$STATS"' EXIT

# Extraer información
docker ps --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" > "$INFO"
docker stats --no-stream --format "{{.ID}}\t{{.CPUPerc}}\t{{.MemPerc}}" > "$STATS"

# Combinar y convertir en JSON
paste "$INFO" "$STATS" | \
awk -F'\t' 'BEGIN {
    print "["
}
{
    if (NR>1) printf ",\n"
    printf "  {\"name\":\"%s\", \"status\":\"%s\", \"cpu\":\"%s\", \"memory\":\"%s\"}", $2, $4, $7, $8
}
END {
    print "\n]"
}'
