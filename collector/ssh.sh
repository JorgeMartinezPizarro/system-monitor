#!/bin/bash
# ssh.sh — access.json: successful logins, failed attempts and banned IPs.
# Output object: {"login":[{ip,last_access,count}],"fails":[...],"banned_ips":[...]}
#
# Source of the sshd events: /var/log/auth.log(.1) when rsyslog writes it (older Debian), otherwise the systemd
# journal (Debian 13 ships no rsyslog). Both give lines whose first field is an ISO timestamp.
# In the collector container the host journal is mounted read-only at /var/log/journal (+ /etc/machine-id),
# and iptables sees the host rules because the container shares the host network namespace.
#
# The log lines carry attacker-controlled text (user names), and the UI turns these IPs into a ban script that
# is pasted into a root shell: only tokens made of IP characters are kept, nothing else reaches the JSON.

AUTH_LOG="${AUTH_LOG:-/var/log/auth.log}"
AUTH_LOG1="${AUTH_LOG1:-/var/log/auth.log.1}"
JOURNAL_SINCE="${JOURNAL_SINCE:--30 days}"

sshd_lines() {
    if [ -s "$AUTH_LOG" ] || [ -s "$AUTH_LOG1" ]; then
        cat "$AUTH_LOG" "$AUTH_LOG1" 2>/dev/null
    elif command -v journalctl >/dev/null 2>&1; then
        # by syslog identifier, independent of the unit name (ssh.service, sshd.service, socket activation).
        # Since OpenSSH 9.8 the per-connection process is "sshd-session": that is where Accepted/Failed lines come from.
        journalctl -t sshd -t sshd-session -o short-iso --no-pager -q --since "$JOURNAL_SINCE" 2>/dev/null
    fi
}

# Logins exitosos
get_successful_logins() {
    sshd_lines | \
    grep "Accepted" | tail -1000 | \
    awk '
    {
        ip=""
        for(i=1;i<=NF;i++) if($i=="from") ip=$(i+1)
        ts=$1   # solo timestamp ISO
        if(ip ~ /^[0-9A-Fa-f:.]+$/ && ip ~ /[.:]/){ last[ip]=ts; count[ip]++ }
    }
    END{
        first=1; print "["
        for(ip in last){
            if(!first) printf ","
            printf "{\"ip\":\"%s\",\"last_access\":\"%s\",\"count\":%d}",ip,last[ip],count[ip]
            first=0
        }
        print "]"
    }'
}

# Logins fallidos
get_failed_logins() {
    sshd_lines | \
    grep -E "Failed password|authentication failure|Too many authentication failures|Disconnecting|Invalid user" | tail -2000 | \
    awk '
    {
        ip=""
        for(i=1;i<=NF;i++){
            if($i=="from"){ ip=$(i+1); break }
            if($i=="user" && $(i+2) ~ /^[0-9]+\./){ ip=$(i+2); break }
            if($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/){ ip=$i }
            if($i ~ /^rhost=/){ ip=$i; sub("rhost=","",ip) }
        }
        ts=$1   # solo timestamp ISO
        if(ip ~ /^[0-9A-Fa-f:.]+$/ && ip ~ /[.:]/){ last[ip]=ts; count[ip]++ }
    }
    END{
        first=1; print "["
        for(ip in last){
            if(!first) printf ","
            printf "{\"ip\":\"%s\",\"last_access\":\"%s\",\"count\":%d}",ip,last[ip],count[ip]
            first=0
        }
        print "]"
    }'
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

# JSON final
echo "{"
echo "  \"login\": $(get_successful_logins),"
echo "  \"fails\": $(get_failed_logins),"
echo "  \"banned_ips\": $(get_banned_ips)"
echo "}"
