# Collector image: generates system.json, access.json, docker.json and status.json for the UI.
# Debian trixie on purpose: journalctl must read the journal written by the host's systemd (Debian 13).
# Runs as root without capabilities except NET_ADMIN (iptables -L), granted by the compose file, not here.
FROM docker:29-cli AS cli

FROM debian:trixie-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends procps systemd iptables \
 && rm -rf /var/lib/apt/lists/*
# the docker CLI is a static binary: no daemon, no extra packages
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
COPY --chmod=0755 *.sh /collector/

ENV OUT_DIR=/reports DISK_PATH=/reports
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD test -n "$(find /reports/system.json -mmin -2 2>/dev/null)"
ENTRYPOINT ["/collector/collect.sh"]
