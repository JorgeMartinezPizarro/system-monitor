#!/bin/bash
# ssh.sh — access.json: successful logins, failed attempts and banned IPs.
# Output object: {"login":[{ip,last_access,count}],"fails":[...],"banned_ips":[...]}
#
# Source of the sshd events: /var/log/auth.log(.1) when rsyslog writes it (older Debian), otherwise the systemd
# journal (Debian 13 ships no rsyslog). Both give lines whose first field is an ISO timestamp.
# In the collector container the host journal is mounted read-only at /var/log/journal (+ /etc/machine-id),
# and iptables sees the host rules because the container shares the host network namespace.
#
# Counting: the whole window is read (JOURNAL_SINCE, or both auth.log files), never just its last lines.
# One failed attempt is one failed connection: sshd writes several lines for it (Invalid user, Failed password,
# pam authentication failure, Disconnecting ...), so lines are grouped by connection (sshd process id, else
# source port) and counted once. A connection that ends in "Accepted" is a login, not a failure.
#
# The log lines carry attacker-controlled text (user names, which may even contain spaces), and the UI turns
# these IPs into a ban script that is pasted into a root shell: only tokens made of IP characters are kept,
# nothing else reaches the JSON. The message type is matched at the start of the message, where the user name
# cannot be, and the IP is the last "<ip> port <n>" of the line, which sshd always writes after the user name.

AUTH_LOG="${AUTH_LOG:-/var/log/auth.log}"
AUTH_LOG1="${AUTH_LOG1:-/var/log/auth.log.1}"
JOURNAL_SINCE="${JOURNAL_SINCE:--30 days}"

LINES=$(mktemp)
trap 'rm -f "$LINES"' EXIT

sshd_lines() {
    if [ -s "$AUTH_LOG" ] || [ -s "$AUTH_LOG1" ]; then
        cat "$AUTH_LOG1" "$AUTH_LOG" 2>/dev/null | grep -E "sshd(-session|-auth)?\[[0-9]+\]:"
    elif command -v journalctl >/dev/null 2>&1; then
        # by syslog identifier, independent of the unit name (ssh.service, sshd.service, socket activation).
        # Since OpenSSH 9.8 the per-connection process is "sshd-session" (and "sshd-auth" since 10.0):
        # that is where Accepted/Failed lines come from.
        journalctl -t sshd -t sshd-session -t sshd-auth -o short-iso --no-pager -q --since "$JOURNAL_SINCE" 2>/dev/null
    fi
}

# Logins exitosos y fallidos, una sola pasada: prints the "login" and "fails" members of the JSON object
logins_and_fails() {
    awk '
    function isip(s) { return s ~ /^[0-9A-Fa-f:.]+$/ && s ~ /[.:]/ }
    function emit(name, cnt, last,    ip, first) {
        printf "  \"%s\": [", name; first = 1
        for (ip in cnt) {
            if (!first) printf ","
            printf "{\"ip\":\"%s\",\"last_access\":\"%s\",\"count\":%d}", ip, last[ip], cnt[ip]
            first = 0
        }
        printf "]"
    }
    {
        # "<timestamp> <host> sshd-session[1234]: <message>"
        tag = ""
        for (i = 2; i <= 4 && i <= NF; i++) if ($i ~ /\[[0-9]+\]:$/) { tag = $i; break }
        if (tag == "") next
        msg = substr($0, index($0, tag) + length(tag) + 1)
        sub(/^ +/, "", msg)

        ok   = (msg ~ /^Accepted /)
        fail = (msg ~ /^(Failed |Invalid user |Disconnecting (invalid|authenticating) user |Connection closed by (invalid|authenticating) user |Disconnected from (invalid|authenticating) user |error: maximum authentication attempts exceeded |pam_unix\(sshd:auth\): authentication failure;)/)
        if (!ok && !fail) next

        # IP: the last "<ip> port <n>" of the line; pam lines have no port, they carry the first rhost=<ip>
        ip = ""; port = ""
        n = split(msg, t, " ")
        for (i = 1; i < n; i++) if (t[i + 1] == "port" && isip(t[i])) { ip = t[i]; port = t[i + 2] }
        if (ip == "") for (i = 1; i <= n; i++) if (t[i] ~ /^rhost=/) { ip = substr(t[i], 7); break }
        if (!isip(ip)) next

        pid = tag; sub(/^.*\[/, "", pid); sub(/\]:$/, "", pid)
        conn = ip SUBSEP (pid != "" ? pid : (port != "" ? port : NR))

        if (ok) { lcount[ip]++; llast[ip] = $1; accepted[conn] = 1 }
        else if (!(conn in seen)) { seen[conn] = 1; fip[conn] = ip; fts[conn] = $1 }
        else fts[conn] = $1
    }
    END {
        for (c in seen) {
            if (c in accepted) continue
            ip = fip[c]; fcount[ip]++
            if (fts[c] > flast[ip]) flast[ip] = fts[c]
        }
        emit("login", lcount, llast); print ","
        emit("fails", fcount, flast); print ","
    }' "$LINES"
}

# IPs baneadas: fail2ban (jail sshd) + reglas DROP manuales de iptables, sin duplicados
get_banned_ips() {
    {
        command -v fail2ban-client >/dev/null 2>&1 && \
            fail2ban-client status sshd 2>/dev/null | sed -n 's/.*Banned IP list:\s*//p' | tr ' ' '\n'
        iptables -L INPUT -n 2>/dev/null | grep DROP | awk '{print $4}'
    } | grep -E "^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$" | sort -u | \
    awk 'BEGIN{first=1;print "["}{if(!first)printf ",";printf "\"%s\"",$1;first=0}END{print "]"}'
}

# The log is read once for both lists (the journal window can be large).
sshd_lines > "$LINES"

# JSON final
echo "{"
logins_and_fails
echo "  \"banned_ips\": $(get_banned_ips)"
echo "}"
