#!/bin/bash
# system.sh — system.json: cpu, ram, disk, swap, load.
# Inside the collector container /proc already shows the host values (cpu, memory, load are not namespaced).
# The disk is measured on DISK_PATH: a bind mount from the host filesystem (the reports folder), not the image's /.
DISK_PATH="${DISK_PATH:-/reports}"

# Información del CPU
CPU_MODEL=$(cat /proc/cpuinfo | grep "model name" | head -1 | cut -d':' -f2 | sed 's/^ //')
CPU_CORES=$(nproc)

# Obtener información de RAM
RAM_INFO=$(free -h | grep Mem:)
RAM_USAGE=$(echo $RAM_INFO | awk '{print $3}')
RAM_MAX=$(echo $RAM_INFO | awk '{print $2}')

# Obtener uso actual de CPU (promedio de 1 segundo)
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | cut -d'%' -f1)

# Obtener fecha y hora actual
CURRENT_DATE=$(date '+%Y-%m-%d %H:%M:%S')

# Obtener información del disco principal
DISK_INFO=$(df -h "$DISK_PATH" | tail -1)
DISK_USAGE=$(echo $DISK_INFO | awk '{print $3}')
DISK_MAX=$(echo $DISK_INFO | awk '{print $2}')

# Obtener información de swap
SWAP_INFO=$(free -h | grep Swap:)
SWAP_USAGE=$(echo $SWAP_INFO | awk '{print $3}')
SWAP_MAX=$(echo $SWAP_INFO | awk '{print $2}')

# Obtener load average
LOAD_AVG=$(cat /proc/loadavg | awk '{print $1, $2, $3}')

# Generar el JSON
cat << EOF
{
  "model": "$CPU_MODEL",
  "timestamp": "$CURRENT_DATE",
  "resources": {
    "cpu": {
      "usage": $CPU_USAGE,
      "frequency": "$(lscpu | grep "CPU MHz:" | awk '{print $3}')MHz",
      "cores": $CPU_CORES
    },
    "ram": {
      "usage": "$RAM_USAGE",
      "max": "$RAM_MAX"
    },
    "disk": {
      "usage": "$DISK_USAGE",
      "max": "$DISK_MAX",
      "usage_percentage": "$(echo $DISK_INFO | awk '{print $5}')"
    },
    "swap": {
      "usage": "$SWAP_USAGE",
      "max": "$SWAP_MAX"
    }
  },
  "summary": {
    "cpu_usage": $CPU_USAGE,
    "ram_usage": "$(free | grep Mem: | awk '{printf "%.0f", $3/$2 * 100}')",
    "disk_usage": $(echo $DISK_INFO | awk '{print $5}' | sed 's/%//'),
    "load_average": "$LOAD_AVG"
  }
}
EOF
