#!/bin/bash
# scripts/security-setup.sh - Security hardening and controls setup

set -euo pipefail

# Configuration
DEPLOYMENT_DIR="${DEPLOYMENT_DIR:-/opt/homelab-gitops-auditor}"
LOG_FILE="${LOG_FILE:-/var/log/homelab-security.log}"
FIREWALL_ENABLED="${ENABLE_FIREWALL:-true}"
ALLOWED_IPS="${ALLOWED_IPS:-192.168.1.0/24,10.0.0.0/8}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${BLUE}INFO:${NC} $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${RED}ERROR:${NC} $1" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${GREEN}SUCCESS:${NC} $1" | tee -a "$LOG_FILE"
}

log_warn() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] ${YELLOW}WARN:${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running with appropriate privileges
check_privileges() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root for security configuration"
        exit 1
    fi
}

# Configure firewall
setup_firewall() {
    if [[ "$FIREWALL_ENABLED" != "true" ]]; then
        log "Firewall setup skipped (disabled in configuration)"
        return 0
    fi
    
    log "Configuring firewall rules..."
    
    # Install ufw if not present
    if ! command -v ufw >/dev/null 2>&1; then
        log "Installing UFW firewall..."
        apt-get update && apt-get install -y ufw
    fi
    
    # Reset firewall to default state
    ufw --force reset
    
    # Default policies
    ufw default deny incoming
    ufw default allow outgoing
    
    # Allow SSH (be careful not to lock yourself out)
    local ssh_port="${SSH_PORT:-22}"
    ufw allow "$ssh_port/tcp" comment "SSH access"
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp comment "HTTP"
    ufw allow 443/tcp comment "HTTPS"
    
    # Allow specific IPs for management access
    IFS=',' read -ra IP_ARRAY <<< "$ALLOWED_IPS"
    for ip_range in "${IP_ARRAY[@]}"; do
        log "Allowing access from: $ip_range"
        ufw allow from "$ip_range" to any port 3071 comment "API access from internal network"
        ufw allow from "$ip_range" to any port 9090 comment "Prometheus from internal network"
        ufw allow from "$ip_range" to any port 3001 comment "Grafana from internal network"
    done
    
    # Rate limiting for SSH
    ufw limit "$ssh_port/tcp" comment "SSH rate limiting"
    
    # Enable firewall
    ufw --force enable
    
    log_success "Firewall configured successfully"
}

# Secure Docker daemon
secure_docker() {
    log "Securing Docker daemon..."
    
    # Create Docker daemon configuration
    local docker_config_dir="/etc/docker"
    mkdir -p "$docker_config_dir"
    
    cat > "$docker_config_dir/daemon.json" <<EOF
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "live-restore": true,
    "userland-proxy": false,
    "no-new-privileges": true,
    "seccomp-profile": "/etc/docker/seccomp-profile.json"
}
EOF

    # Create seccomp profile for enhanced security
    cat > "$docker_config_dir/seccomp-profile.json" <<'EOF'
{
    "defaultAction": "SCMP_ACT_ERRNO",
    "archMap": [
        {
            "architecture": "SCMP_ARCH_X86_64",
            "subArchitectures": [
                "SCMP_ARCH_X86",
                "SCMP_ARCH_X32"
            ]
        }
    ],
    "syscalls": [
        {
            "names": [
                "accept",
                "accept4",
                "access",
                "adjtimex",
                "alarm",
                "bind",
                "brk",
                "capget",
                "capset",
                "chdir",
                "chmod",
                "chown",
                "chroot",
                "clock_getres",
                "clock_gettime",
                "clock_nanosleep",
                "close",
                "connect",
                "copy_file_range",
                "creat",
                "dup",
                "dup2",
                "dup3",
                "epoll_create",
                "epoll_create1",
                "epoll_ctl",
                "epoll_pwait",
                "epoll_wait",
                "eventfd",
                "eventfd2",
                "execve",
                "execveat",
                "exit",
                "exit_group",
                "faccessat",
                "fadvise64",
                "fallocate",
                "fanotify_mark",
                "fchdir",
                "fchmod",
                "fchmodat",
                "fchown",
                "fchownat",
                "fcntl",
                "fdatasync",
                "fgetxattr",
                "flistxattr",
                "flock",
                "fork",
                "fremovexattr",
                "fsetxattr",
                "fstat",
                "fstatfs",
                "fsync",
                "ftruncate",
                "futex",
                "getcwd",
                "getdents",
                "getdents64",
                "getegid",
                "geteuid",
                "getgid",
                "getgroups",
                "getpeername",
                "getpgid",
                "getpgrp",
                "getpid",
                "getppid",
                "getpriority",
                "getrandom",
                "getresgid",
                "getresuid",
                "getrlimit",
                "get_robust_list",
                "getrusage",
                "getsid",
                "getsockname",
                "getsockopt",
                "get_thread_area",
                "gettid",
                "gettimeofday",
                "getuid",
                "getxattr",
                "inotify_add_watch",
                "inotify_init",
                "inotify_init1",
                "inotify_rm_watch",
                "io_cancel",
                "ioctl",
                "io_destroy",
                "io_getevents",
                "io_setup",
                "io_submit",
                "ipc",
                "kill",
                "lchown",
                "lgetxattr",
                "link",
                "linkat",
                "listen",
                "listxattr",
                "llistxattr",
                "lremovexattr",
                "lseek",
                "lsetxattr",
                "lstat",
                "madvise",
                "memfd_create",
                "mincore",
                "mkdir",
                "mkdirat",
                "mknod",
                "mknodat",
                "mlock",
                "mlock2",
                "mlockall",
                "mmap",
                "mount",
                "mprotect",
                "mq_getsetattr",
                "mq_notify",
                "mq_open",
                "mq_timedreceive",
                "mq_timedsend",
                "mq_unlink",
                "mremap",
                "msgctl",
                "msgget",
                "msgrcv",
                "msgsnd",
                "msync",
                "munlock",
                "munlockall",
                "munmap",
                "nanosleep",
                "newfstatat",
                "open",
                "openat",
                "pause",
                "pipe",
                "pipe2",
                "poll",
                "ppoll",
                "prctl",
                "pread64",
                "preadv",
                "prlimit64",
                "pselect6",
                "ptrace",
                "pwrite64",
                "pwritev",
                "read",
                "readahead",
                "readlink",
                "readlinkat",
                "readv",
                "recv",
                "recvfrom",
                "recvmmsg",
                "recvmsg",
                "remap_file_pages",
                "removexattr",
                "rename",
                "renameat",
                "renameat2",
                "restart_syscall",
                "rmdir",
                "rt_sigaction",
                "rt_sigpending",
                "rt_sigprocmask",
                "rt_sigqueueinfo",
                "rt_sigreturn",
                "rt_sigsuspend",
                "rt_sigtimedwait",
                "rt_tgsigqueueinfo",
                "sched_getaffinity",
                "sched_getattr",
                "sched_getparam",
                "sched_get_priority_max",
                "sched_get_priority_min",
                "sched_getscheduler",
                "sched_setaffinity",
                "sched_setattr",
                "sched_setparam",
                "sched_setscheduler",
                "sched_yield",
                "seccomp",
                "select",
                "semctl",
                "semget",
                "semop",
                "semtimedop",
                "send",
                "sendfile",
                "sendmmsg",
                "sendmsg",
                "sendto",
                "setfsgid",
                "setfsuid",
                "setgid",
                "setgroups",
                "setitimer",
                "setpgid",
                "setpriority",
                "setregid",
                "setresgid",
                "setresuid",
                "setreuid",
                "setrlimit",
                "set_robust_list",
                "setsid",
                "setsockopt",
                "set_thread_area",
                "set_tid_address",
                "setuid",
                "setxattr",
                "shmat",
                "shmctl",
                "shmdt",
                "shmget",
                "shutdown",
                "sigaltstack",
                "signalfd",
                "signalfd4",
                "sigreturn",
                "socket",
                "socketcall",
                "socketpair",
                "splice",
                "stat",
                "statfs",
                "statx",
                "symlink",
                "symlinkat",
                "sync",
                "sync_file_range",
                "syncfs",
                "sysinfo",
                "tee",
                "tgkill",
                "time",
                "timer_create",
                "timer_delete",
                "timerfd_create",
                "timerfd_gettime",
                "timerfd_settime",
                "timer_getoverrun",
                "timer_gettime",
                "timer_settime",
                "times",
                "tkill",
                "truncate",
                "umask",
                "uname",
                "unlink",
                "unlinkat",
                "utime",
                "utimensat",
                "utimes",
                "vfork",
                "vmsplice",
                "wait4",
                "waitid",
                "waitpid",
                "write",
                "writev"
            ],
            "action": "SCMP_ACT_ALLOW"
        }
    ]
}
EOF

    # Restart Docker daemon
    systemctl restart docker
    
    log_success "Docker daemon secured"
}

# Configure fail2ban
setup_fail2ban() {
    log "Setting up fail2ban..."
    
    # Install fail2ban if not present
    if ! command -v fail2ban-server >/dev/null 2>&1; then
        log "Installing fail2ban..."
        apt-get update && apt-get install -y fail2ban
    fi
    
    # Create fail2ban configuration for our services
    cat > "/etc/fail2ban/jail.d/homelab.conf" <<EOF
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5
backend = systemd

[sshd]
enabled = true
port = ${SSH_PORT:-22}
logpath = /var/log/auth.log

[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10

[homelab-api]
enabled = true
port = 3071
logpath = /opt/homelab-gitops-auditor/logs/api.log
maxretry = 10
findtime = 300
bantime = 1800
EOF

    # Create filter for API abuse
    cat > "/etc/fail2ban/filter.d/homelab-api.conf" <<EOF
[Definition]
failregex = ^.*ERROR.*Failed authentication.*<HOST>.*$
            ^.*ERROR.*Rate limit exceeded.*<HOST>.*$
            ^.*ERROR.*Suspicious activity.*<HOST>.*$
ignoreregex =
EOF

    # Restart fail2ban
    systemctl restart fail2ban
    systemctl enable fail2ban
    
    log_success "fail2ban configured"
}

# Secure system settings
secure_system() {
    log "Applying system security hardening..."
    
    # Disable unused services
    local services_to_disable=("avahi-daemon" "cups" "bluetooth")
    for service in "${services_to_disable[@]}"; do
        if systemctl is-enabled "$service" >/dev/null 2>&1; then
            systemctl disable "$service" || log_warn "Could not disable $service"
        fi
    done
    
    # Configure kernel parameters
    cat > "/etc/sysctl.d/99-homelab-security.conf" <<EOF
# Network security
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.rp_filter = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.icmp_ignore_bogus_error_responses = 1
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1
net.ipv4.tcp_timestamps = 0

# Memory protection
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.yama.ptrace_scope = 1

# File system security
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.suid_dumpable = 0
EOF

    # Apply sysctl settings
    sysctl -p /etc/sysctl.d/99-homelab-security.conf
    
    # Set file permissions
    chmod 600 /etc/shadow
    chmod 600 /etc/gshadow
    chmod 644 /etc/passwd
    chmod 644 /etc/group
    
    # Configure SSH security (if OpenSSH is installed)
    if [[ -f "/etc/ssh/sshd_config" ]]; then
        log "Securing SSH configuration..."
        
        # Backup original config
        cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup
        
        # Apply secure SSH settings
        sed -i 's/#Protocol 2/Protocol 2/' /etc/ssh/sshd_config
        sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
        sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
        sed -i 's/#PermitEmptyPasswords no/PermitEmptyPasswords no/' /etc/ssh/sshd_config
        sed -i 's/#MaxAuthTries 6/MaxAuthTries 3/' /etc/ssh/sshd_config
        sed -i 's/#ClientAliveInterval 0/ClientAliveInterval 300/' /etc/ssh/sshd_config
        sed -i 's/#ClientAliveCountMax 3/ClientAliveCountMax 2/' /etc/ssh/sshd_config
        
        # Add security-focused settings
        cat >> /etc/ssh/sshd_config <<EOF

# Additional security settings
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
UseDNS no
PermitTunnel no
MaxStartups 2
LoginGraceTime 30
EOF

        # Restart SSH service
        systemctl restart ssh || systemctl restart sshd
    fi
    
    log_success "System security hardening completed"
}

# Set up log monitoring
setup_log_monitoring() {
    log "Setting up log monitoring..."
    
    # Create logrotate configuration
    cat > "/etc/logrotate.d/homelab" <<EOF
/opt/homelab-gitops-auditor/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx || true
    endscript
}

/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx || true
    endscript
}
EOF

    # Set up auditd if available
    if command -v auditd >/dev/null 2>&1; then
        log "Configuring auditd..."
        
        cat > "/etc/audit/rules.d/homelab.rules" <<EOF
# Monitor file changes in application directory
-w /opt/homelab-gitops-auditor -p wa -k homelab_files

# Monitor configuration changes
-w /etc/docker/ -p wa -k docker_config
-w /etc/nginx/ -p wa -k nginx_config
-w /etc/ssh/sshd_config -p wa -k ssh_config

# Monitor user actions
-w /etc/passwd -p wa -k identity
-w /etc/group -p wa -k identity
-w /etc/shadow -p wa -k identity
-w /etc/sudoers -p wa -k identity

# Monitor network configuration
-w /etc/network/ -p wa -k network_config
-w /etc/hosts -p wa -k network_config

# Monitor process execution
-a always,exit -F arch=b64 -S execve -k process_execution
EOF

        systemctl restart auditd
    fi
    
    log_success "Log monitoring configured"
}

# Generate SSL certificates
setup_ssl_certificates() {
    local domain="${DOMAIN:-homelab.local}"
    
    log "Setting up SSL certificates for $domain..."
    
    # Create SSL directory
    mkdir -p "${DEPLOYMENT_DIR}/nginx/ssl"
    
    if [[ "${SSL_MODE:-automatic}" == "automatic" ]]; then
        log "SSL will be handled automatically by Let's Encrypt"
        
        # Create directory for ACME challenge
        mkdir -p "${DEPLOYMENT_DIR}/nginx/www/.well-known/acme-challenge"
        
        # Set permissions
        chown -R www-data:www-data "${DEPLOYMENT_DIR}/nginx/www"
        
    else
        log "Generating self-signed certificates for development..."
        
        # Generate self-signed certificate
        openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
            -keyout "${DEPLOYMENT_DIR}/nginx/ssl/key.pem" \
            -out "${DEPLOYMENT_DIR}/nginx/ssl/cert.pem" \
            -subj "/C=US/ST=Local/L=Local/O=Homelab/OU=GitOps/CN=$domain"
        
        # Set permissions
        chmod 600 "${DEPLOYMENT_DIR}/nginx/ssl/key.pem"
        chmod 644 "${DEPLOYMENT_DIR}/nginx/ssl/cert.pem"
    fi
    
    log_success "SSL certificates configured"
}

# Validate security configuration
validate_security() {
    log "Validating security configuration..."
    
    local issues=0
    
    # Check firewall status
    if ! ufw status | grep -q "Status: active"; then
        log_warn "Firewall is not active"
        ((issues++))
    fi
    
    # Check fail2ban status
    if ! systemctl is-active fail2ban >/dev/null 2>&1; then
        log_warn "fail2ban is not running"
        ((issues++))
    fi
    
    # Check Docker security
    if ! docker info 2>/dev/null | grep -q "Security Options"; then
        log_warn "Docker security features may not be enabled"
        ((issues++))
    fi
    
    # Check file permissions
    local sensitive_files=("/etc/shadow" "/etc/gshadow")
    for file in "${sensitive_files[@]}"; do
        if [[ -f "$file" ]]; then
            local perms=$(stat -c "%a" "$file")
            if [[ "$perms" != "600" ]]; then
                log_warn "Insecure permissions on $file: $perms"
                ((issues++))
            fi
        fi
    done
    
    # Check SSH configuration
    if [[ -f "/etc/ssh/sshd_config" ]]; then
        if grep -q "PermitRootLogin yes" /etc/ssh/sshd_config; then
            log_warn "Root login is enabled in SSH"
            ((issues++))
        fi
        
        if grep -q "PasswordAuthentication yes" /etc/ssh/sshd_config; then
            log_warn "Password authentication is enabled in SSH"
            ((issues++))
        fi
    fi
    
    if [[ $issues -eq 0 ]]; then
        log_success "Security validation passed"
        return 0
    else
        log_warn "Security validation found $issues issues"
        return 1
    fi
}

# Main function
main() {
    local command="${1:-setup}"
    
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Homelab Security Setup and Hardening  ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
    
    case "$command" in
        "setup")
            check_privileges
            setup_firewall
            secure_docker
            setup_fail2ban
            secure_system
            setup_log_monitoring
            setup_ssl_certificates
            validate_security
            log_success "Security setup completed successfully"
            ;;
        "firewall")
            check_privileges
            setup_firewall
            ;;
        "docker")
            check_privileges
            secure_docker
            ;;
        "fail2ban")
            check_privileges
            setup_fail2ban
            ;;
        "system")
            check_privileges
            secure_system
            ;;
        "ssl")
            setup_ssl_certificates
            ;;
        "validate")
            validate_security
            ;;
        "help"|*)
            echo "Usage: $0 {setup|firewall|docker|fail2ban|system|ssl|validate|help}"
            echo ""
            echo "Commands:"
            echo "  setup      - Full security setup (requires root)"
            echo "  firewall   - Configure UFW firewall"
            echo "  docker     - Secure Docker daemon"
            echo "  fail2ban   - Setup fail2ban protection"
            echo "  system     - Apply system hardening"
            echo "  ssl        - Setup SSL certificates"
            echo "  validate   - Validate security configuration"
            echo "  help       - Show this help"
            ;;
    esac
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi