#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="xmpp-p2p"
SERVICE_NAME="xmpp-p2p"
INSTALL_DIR="/var/www/xmpp-p2p"
SERVICE_USER="www-data"
SERVICE_GROUP="www-data"
P2P_PORT="4000"
UI_PORT="3000"
UPLOAD_PORT="0"
UPLOAD_HOST="127.0.0.1"
ENABLE_RELAY=false
ENABLE_WEBRTC=false
COMPONENT_HOST=""
COMPONENT_PORT="5347"
COMPONENT_SECRET=""
COMPONENT_DOMAIN=""
S2S_DOMAIN=""
PASSPHRASE=""
PROXY_MODE="auto"
DOMAIN=""
CADDY_EMAIL=""
SSH_PORT="22"
DRY_RUN=false
SKIP_BUILD=false
SSH_TARGET=""
SSH_CONTROL_PATH="${TMPDIR:-/tmp}/xmpp-p2p-ssh-control"
REMOTE_STAGE_DIR="/tmp/${SERVICE_NAME}-deploy"
TOTAL_STEPS=6
CURRENT_STEP=0
CURRENT_STEP_LABEL=""
TTY_AVAILABLE=false
USE_COLOR=false
SPINNER_PID=""
SPINNER_LABEL=""
SPINNER_RUNNING=false

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_P2P_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
REMOTE_UI_SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}-ui.service"

log() {
	printf '[deploy] %s\n' "$*"
}

warn() {
	printf '[deploy] warning: %s\n' "$*" >&2
}

die() {
	printf '[deploy] error: %s\n' "$*" >&2
	exit 1
}

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
	USE_COLOR=true
fi

if [[ "$USE_COLOR" == true ]]; then
	C_RESET=$'\033[0m'
	C_BOLD=$'\033[1m'
	C_DIM=$'\033[2m'
	C_RED=$'\033[31m'
	C_GREEN=$'\033[32m'
	C_YELLOW=$'\033[33m'
	C_BLUE=$'\033[34m'
	C_CYAN=$'\033[36m'
else
	C_RESET=''
	C_BOLD=''
	C_DIM=''
	C_RED=''
	C_GREEN=''
	C_YELLOW=''
	C_BLUE=''
	C_CYAN=''
fi

paint() {
	local color="$1"
	shift
	printf '%s%s%s' "$color" "$*" "$C_RESET"
}

status_good() { paint "$C_GREEN" "$*"; }
status_bad() { paint "$C_RED" "$*"; }
status_warn() { paint "$C_YELLOW" "$*"; }
status_info() { paint "$C_CYAN" "$*"; }

hr() {
	local width="${1:-72}"
	printf '%*s\n' "$width" '' | tr ' ' '-'
}

panel_line() {
	local text="$1"
	printf '| %-*s |\n' 68 "${text:0:68}"
}

render_header() {
	local proxy_display="$PROXY_MODE"
	if [[ "$PROXY_MODE" == "auto" && -n "$proxy_mode_resolved" ]]; then
		proxy_display="auto -> ${proxy_mode_resolved}"
	fi

	printf '\n'
	hr
	panel_line "$(status_info "XMPP P2P deploy installer")"
	hr
	panel_line "target    : ${SSH_TARGET}"
	panel_line "install   : ${INSTALL_DIR}"
	panel_line "service   : ${SERVICE_NAME}"
	panel_line "p2p port  : ${P2P_PORT} (WS: $((P2P_PORT + 1000)))"
	panel_line "ui port   : ${UI_PORT}"
	panel_line "proxy     : ${proxy_display}"
	panel_line "domain    : ${DOMAIN:-<none>}"
	panel_line "relay     : ${ENABLE_RELAY}"
	panel_line "webrtc    : ${ENABLE_WEBRTC}"
	panel_line "build     : $([[ "$SKIP_BUILD" == true ]] && printf 'skip local build' || printf 'npm ci + tsc + esbuild + vite')"
	panel_line "tty       : $([[ "$TTY_AVAILABLE" == true ]] && printf 'interactive' || printf 'non-interactive')"
	hr
	printf '\n'
}

spinner_start() {
	local label="$1"
	SPINNER_LABEL="$label"
	SPINNER_RUNNING=true
	if [[ "$USE_COLOR" != true ]]; then
		return 0
	fi

	(
		local frames=('|' '/' '-' '\\')
		local i=0
		while :; do
			printf '\r%s %s' "$(status_info "${frames[i % 4]}")" "$SPINNER_LABEL" >&2
			i=$((i + 1))
			sleep 0.1
		done
	) &
	SPINNER_PID=$!
}

spinner_stop() {
	local result="${1:-0}"
	SPINNER_RUNNING=false
	if [[ -n "$SPINNER_PID" ]]; then
		kill "$SPINNER_PID" 2>/dev/null || true
		wait "$SPINNER_PID" 2>/dev/null || true
		SPINNER_PID=""
	fi
	if [[ "$USE_COLOR" == true ]]; then
		printf '\r%*s\r' 120 '' >&2
	fi
	if [[ "$result" == 0 ]]; then
		printf '%s %s\n' "$(status_good '[ok]')" "$SPINNER_LABEL"
	else
		printf '%s %s\n' "$(status_bad '[fail]')" "$SPINNER_LABEL"
	fi
	SPINNER_LABEL=""
}

run_spinner() {
	local label="$1"
	shift
	if [[ "$USE_COLOR" != true ]]; then
		"$@"
		return
	fi

	spinner_start "$label"
	if "$@"; then
		spinner_stop 0
	else
		local rc=$?
		spinner_stop "$rc"
		return "$rc"
	fi
}

step_begin() {
	CURRENT_STEP=$((CURRENT_STEP + 1))
	CURRENT_STEP_LABEL="$1"
	printf '\n%s [%d/%d] %s\n' "$(status_info '>>>')" "$CURRENT_STEP" "$TOTAL_STEPS" "$CURRENT_STEP_LABEL"
}

step_done() {
	printf '%s [%d/%d] %s\n' "$(status_good '[ok]')" "$CURRENT_STEP" "$TOTAL_STEPS" "$CURRENT_STEP_LABEL"
	CURRENT_STEP_LABEL=""
}

on_error() {
	local exit_code="$1"
	local line_no="$2"
	if [[ -n "$CURRENT_STEP_LABEL" ]]; then
		printf '\n%s [%d/%d] %s\n' "$(status_bad '[fail]')" "$CURRENT_STEP" "$TOTAL_STEPS" "$CURRENT_STEP_LABEL" >&2
	fi
	printf '%s command failed at line %s (exit %s)\n' "$(status_bad '[deploy] error:')" "$line_no" "$exit_code" >&2
}

usage() {
	cat <<'EOF'
Usage:
  scripts/deploy-remote.sh --host user@server [options]

Options:
  --host <user@host>         SSH target for the remote server
  --p2p-port <port>          libp2p TCP port (default: 4000; WebSocket = +1000)
  --ui-port <port>           UI SPA HTTP server port (default: 3000)
  --upload-port <port>       HTTP file upload port (default: 0 = ephemeral)
  --upload-host <host>       HTTP file upload bind host (default: 127.0.0.1)
  --relay                    Enable circuit relay server for browser peers
  --webrtc                   Enable WebRTC transport
  --component-host <host>    XMPP server hostname for component connection
  --component-port <port>    XMPP component port (default: 5347)
  --component-secret <sec>   Shared secret for component authentication
  --component-domain <dom>   Component subdomain (e.g. p2p.example.com)
  --s2s-domain <domain>      Local domain for direct S2S federation
  --passphrase <pass>        Passphrase for encrypted local key storage
  --install-dir <path>       Remote install path (default: /var/www/xmpp-p2p)
  --service-user <user>      Systemd service user (default: www-data)
  --service-group <group>    Systemd service group (default: www-data)
  --proxy auto|caddy|nginx|none  Reverse proxy mode (default: auto)
  --domain <hostname>        Reverse proxy hostname (required for caddy/nginx)
  --caddy-email <email>      Caddy ACME contact email
  --ssh-port <port>          SSH port (default: 22)
  --skip-build               Skip the local build step
  --dry-run                  Print actions without executing them
  -h, --help                 Show this help

Environment overrides:
  XMPP_P2P_SSH_TARGET, XMPP_P2P_PORT, XMPP_UI_PORT,
  XMPP_UPLOAD_PORT, XMPP_UPLOAD_HOST, XMPP_RELAY, XMPP_WEBRTC,
  XMPP_COMPONENT_HOST, XMPP_COMPONENT_PORT, XMPP_COMPONENT_SECRET,
  XMPP_COMPONENT_DOMAIN, XMPP_S2S_DOMAIN, XMPP_PASSPHRASE,
  XMPP_P2P_INSTALL_DIR, XMPP_P2P_SERVICE_USER, XMPP_P2P_SERVICE_GROUP,
  XMPP_P2P_PROXY, XMPP_P2P_DOMAIN, XMPP_P2P_CADDY_EMAIL,
  XMPP_P2P_SSH_PORT, XMPP_P2P_DRY_RUN, XMPP_P2P_SKIP_BUILD
EOF
}

is_true() {
	case "${1,,}" in
		1|true|yes|on) return 0 ;;
		*) return 1 ;;
	esac
}

run_local() {
	if [[ "$DRY_RUN" == true ]]; then
		printf '[dry-run] '
		printf '%q ' "$@"
		printf '\n'
		return 0
	fi
	"$@"
}

ssh_common_opts() {
	printf -- '-o ControlMaster=auto -o ControlPersist=10m -o ControlPath=%q' "$SSH_CONTROL_PATH"
}

open_ssh_master() {
	if [[ "$DRY_RUN" == true ]]; then
		printf '[dry-run] ssh -MNf -p %s %s\n' "$SSH_PORT" "$SSH_TARGET"
		return 0
	fi
	ssh -MNf -p "$SSH_PORT" \
		-o "ControlMaster=auto" \
		-o "ControlPersist=10m" \
		-o "ControlPath=${SSH_CONTROL_PATH}" \
		"$SSH_TARGET"
}

run_remote() {
	local script="$1"
	shift || true
	local remote_args
	printf -v remote_args '%q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q' \
		"$INSTALL_DIR" "$SERVICE_NAME" "$SERVICE_USER" "$SERVICE_GROUP" \
		"$P2P_PORT" "$UI_PORT" "$UPLOAD_PORT" "$UPLOAD_HOST" \
		"$ENABLE_RELAY" "$ENABLE_WEBRTC" \
		"$COMPONENT_HOST" "$COMPONENT_PORT" "$COMPONENT_SECRET" "$COMPONENT_DOMAIN" \
		"$S2S_DOMAIN" "$PASSPHRASE" \
		"$PROXY_MODE" "$DOMAIN" "$CADDY_EMAIL"
	if [[ "$DRY_RUN" == true ]]; then
		printf '[dry-run] ssh -tt -p %s -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=%q %s bash -s -- %s\n' \
			"$SSH_PORT" "$SSH_CONTROL_PATH" "$SSH_TARGET" "$remote_args"
		printf '%s\n' "$script"
		return 0
	fi
	ssh -tt -p "$SSH_PORT" \
		-o "ControlMaster=auto" \
		-o "ControlPersist=10m" \
		-o "ControlPath=${SSH_CONTROL_PATH}" \
		"$SSH_TARGET" "bash -s -- $remote_args" <<<"$script"
}

build_app() {
	if [[ "$DRY_RUN" == true ]]; then
		step_begin "local build (dry-run)"
		log "skipping local build"
		step_done
		return
	fi
	if [[ "$SKIP_BUILD" == true ]]; then
		step_begin "local build (skipped)"
		log "skipping local build"
		step_done
		return
	fi

	step_begin "install root dependencies (npm ci)"
	(
		cd "$REPO_ROOT"
		npm ci
	)
	step_done

	step_begin "build TypeScript (tsc)"
	(
		cd "$REPO_ROOT"
		npm run build
	)
	step_done

	step_begin "build browser bundle (esbuild)"
	(
		cd "$REPO_ROOT"
		npm run build:browser
	)
	step_done

	step_begin "build UI (vite)"
	(
		cd "$REPO_ROOT"
		npm --prefix ui run build
	)
	step_done
}

sync_app() {
	step_begin "sync repository"
	log "copying repo to ${SSH_TARGET}:${REMOTE_STAGE_DIR}"
	if [[ "$DRY_RUN" != true ]]; then
		open_ssh_master
	fi

	local rsync_opts="-az --delete --no-owner --no-group -e \"ssh -p ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=${SSH_CONTROL_PATH}\""

	run_local rsync -az --delete --no-owner --no-group -e "ssh -p ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=${SSH_CONTROL_PATH}" \
		--exclude='.git' \
		--exclude='.claude' \
		--exclude='node_modules' \
		--exclude='dist' \
		--exclude='coverage' \
		"${REPO_ROOT}/" "${SSH_TARGET}:${REMOTE_STAGE_DIR}/"

	if [[ -d "${REPO_ROOT}/dist" ]]; then
		log "copying dist/ build artifacts"
		run_local rsync -az --delete --no-owner --no-group -e "ssh -p ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=${SSH_CONTROL_PATH}" \
			"${REPO_ROOT}/dist/" "${SSH_TARGET}:${REMOTE_STAGE_DIR}/dist/"
	fi

	if [[ -d "${REPO_ROOT}/ui/dist" ]]; then
		log "copying ui/dist/ build artifacts"
		run_local rsync -az --delete --no-owner --no-group -e "ssh -p ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=${SSH_CONTROL_PATH}" \
			"${REPO_ROOT}/ui/dist/" "${SSH_TARGET}:${REMOTE_STAGE_DIR}/ui/dist/"
	fi

	if [[ -f "${REPO_ROOT}/dist/browser/bundle.js" ]]; then
		log "copying browser bundle"
		run_local rsync -az --delete --no-owner --no-group -e "ssh -p ${SSH_PORT} -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=${SSH_CONTROL_PATH}" \
			"${REPO_ROOT}/dist/browser/" "${SSH_TARGET}:${REMOTE_STAGE_DIR}/dist/browser/"
	fi
	step_done
}

install_remote_service() {
	step_begin "install remote service"
	local remote_script
	remote_script="$(cat <<'EOF'
set -Eeuo pipefail

INSTALL_DIR="$1"
STAGING_DIR="$2"
SERVICE_NAME="$3"
SERVICE_USER="$4"
SERVICE_GROUP="$5"
P2P_PORT="$6"
UI_PORT="$7"
UPLOAD_PORT="$8"
UPLOAD_HOST="$9"
ENABLE_RELAY="${10}"
ENABLE_WEBRTC="${11}"
COMPONENT_HOST="${12}"
COMPONENT_PORT="${13}"
COMPONENT_SECRET="${14}"
COMPONENT_DOMAIN="${15}"
S2S_DOMAIN="${16}"
PASSPHRASE="${17}"
PROXY_MODE="${18}"
DOMAIN="${19}"
CADDY_EMAIL="${20}"
DRY_RUN=false
CURRENT_STEP=0
CURRENT_STEP_LABEL=""

WS_PORT=$((P2P_PORT + 1000))

log() {
	printf '[remote] %s\n' "$*"
}

warn() {
	printf '[remote] warning: %s\n' "$*" >&2
}

die() {
	printf '[remote] error: %s\n' "$*" >&2
	exit 1
}

hr() {
	local width="${1:-64}"
	printf '%*s\n' "$width" '' | tr ' ' '-'
}

panel_line() {
	local text="$1"
	printf '| %-*s |\n' 60 "${text:0:60}"
}

remote_step_begin() {
	CURRENT_STEP=$((CURRENT_STEP + 1))
	CURRENT_STEP_LABEL="$1"
	printf '\n[remote %d] >>> %s\n' "$CURRENT_STEP" "$CURRENT_STEP_LABEL"
}

remote_step_done() {
	printf '[remote %d] [ok] %s\n' "$CURRENT_STEP" "$CURRENT_STEP_LABEL"
	CURRENT_STEP_LABEL=""
}

sudo_run() {
	sudo -n "$@"
}

port_is_listening() {
	local check_port="$1"
	ss -H -ltn "sport = :${check_port}" | grep -q .
}

find_available_port() {
	local base_port="$1"
	local port="$base_port"
	while port_is_listening "$port"; do
		port=$((port + 1))
	done
	printf '%s' "$port"
}

service_is_active() {
	local svc="$1"
	sudo_run systemctl is-active --quiet "${svc}.service"
}

wait_for_ready() {
	local svc="$1"
	local check_port="$2"
	local attempt
	for attempt in $(seq 1 30); do
		if service_is_active "$svc" && port_is_listening "$check_port"; then
			return 0
		fi
		sleep 1
	done

	warn "service ${svc} did not become ready on port ${check_port}"
	sudo_run systemctl status "${svc}.service" --no-pager -l || true
	sudo_run journalctl -u "${svc}.service" --no-pager -n 100 || true
	die "service ${svc} failed to bind to port ${check_port}"
}

is_true() {
	case "${1,,}" in
		1|true|yes|on) return 0 ;;
		*) return 1 ;;
	esac
}

trim() {
	sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

managed_marker="# managed by xmpp-p2p"
proxy_mode_resolved="$PROXY_MODE"

command -v python3 >/dev/null 2>&1 || die "python3 is required on the remote server"
command -v systemctl >/dev/null 2>&1 || die "systemctl is required on the remote server"
command -v ss >/dev/null 2>&1 || die "ss is required on the remote server"
command -v curl >/dev/null 2>&1 || die "curl is required on the remote server"
command -v rsync >/dev/null 2>&1 || die "rsync is required on the remote server"

log "refreshing sudo credentials"
sudo -v

if [[ "$proxy_mode_resolved" == "auto" ]]; then
	if command -v caddy >/dev/null 2>&1; then
		proxy_mode_resolved="caddy"
	elif command -v nginx >/dev/null 2>&1; then
		proxy_mode_resolved="nginx"
	else
		proxy_mode_resolved="none"
	fi
fi

printf '\n'
hr
panel_line "XMPP P2P remote installer"
hr
panel_line "install  : ${INSTALL_DIR}"
panel_line "service  : ${SERVICE_NAME}"
panel_line "p2p port : ${P2P_PORT} (WS: ${WS_PORT})"
panel_line "ui port  : ${UI_PORT}"
panel_line "proxy    : ${proxy_mode_resolved}"
panel_line "domain   : ${DOMAIN:-<none>}"
panel_line "relay    : ${ENABLE_RELAY}"
panel_line "webrtc   : ${ENABLE_WEBRTC}"
hr
printf '\n'

remote_step_begin "prepare install directory"
if [[ "$proxy_mode_resolved" != "none" && -z "$DOMAIN" ]]; then
	die "a domain is required when reverse proxying"
fi
sudo_run install -d -m 0755 "$INSTALL_DIR"
sudo_run rsync -a --delete "$STAGING_DIR"/ "$INSTALL_DIR"/
sudo_run chown -R "${SERVICE_USER}:${SERVICE_GROUP}" "$INSTALL_DIR"
remote_step_done

write_managed_file() {
	local target="$1"
	local content="$2"
	if [[ -f "$target" ]] && ! grep -qF "$managed_marker" "$target"; then
		die "${target} exists and is not managed by this script; refusing to overwrite"
	fi
	local tmp
	tmp="$(mktemp)"
	printf '%s\n' "$content" >"$tmp"
	sudo_run install -d -m 0755 "$(dirname "$target")"
	sudo_run install -m 0644 "$tmp" "$target"
	rm -f "$tmp"
}

build_daemon_args() {
	local args="--port=${P2P_PORT} --host=0.0.0.0"
	if is_true "$ENABLE_RELAY"; then
		args="$args --relay"
	fi
	if is_true "$ENABLE_WEBRTC"; then
		args="$args --webrtc"
	fi
	if [[ -n "$COMPONENT_HOST" ]]; then
		args="$args --component-host=${COMPONENT_HOST}"
		args="$args --component-port=${COMPONENT_PORT}"
		if [[ -n "$COMPONENT_SECRET" ]]; then
			args="$args --component-secret=${COMPONENT_SECRET}"
		fi
		if [[ -n "$COMPONENT_DOMAIN" ]]; then
			args="$args --component-domain=${COMPONENT_DOMAIN}"
		fi
	fi
	if [[ -n "$S2S_DOMAIN" ]]; then
		args="$args --s2s-domain=${S2S_DOMAIN}"
	fi
	if [[ -n "$PASSPHRASE" ]]; then
		args="$args --passphrase=${PASSPHRASE}"
	fi
	printf '%s' "$args"
}

build_env_lines() {
	local lines=""
	lines="${lines}Environment=XMPP_UPLOAD_HOST=${UPLOAD_HOST}\n"
	lines="${lines}Environment=XMPP_UPLOAD_PORT=${UPLOAD_PORT}\n"
	printf '%b' "$lines"
}

install_services() {
	remote_step_begin "write systemd services"

	local daemon_args
	daemon_args="$(build_daemon_args)"
	local env_lines
	env_lines="$(build_env_lines)"

	# P2P daemon service
	cat >/tmp/${SERVICE_NAME}.service <<SERVICEEOF
[Unit]
Description=${SERVICE_NAME} P2P node daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
${env_lines}
ExecStart=node ${INSTALL_DIR}/dist/index.js ${daemon_args}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICEEOF

	sudo_run install -m 0644 /tmp/${SERVICE_NAME}.service /etc/systemd/system/${SERVICE_NAME}.service
	rm -f /tmp/${SERVICE_NAME}.service

	# UI static SPA service
	cat >/tmp/${SERVICE_NAME}-ui.service <<UISERVICEEOF
[Unit]
Description=${SERVICE_NAME} UI static SPA
After=network.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
ExecStart=python3 ${INSTALL_DIR}/scripts/http-server.py ${INSTALL_DIR}/ui/dist --bind 127.0.0.1 --port ${UI_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UISERVICEEOF

	sudo_run install -m 0644 /tmp/${SERVICE_NAME}-ui.service /etc/systemd/system/${SERVICE_NAME}-ui.service
	rm -f /tmp/${SERVICE_NAME}-ui.service

	remote_step_done
}

detect_caddy_snippet_dir() {
	for dir in /etc/caddy/conf.d /etc/caddy/Caddyfile.d; do
		if [[ -d "$dir" ]]; then
			printf '%s' "$dir"
			return 0
		fi
	done
	return 1
}

configure_caddy() {
	local domain="$1"
	local ui_port="$2"
	local ws_port="$3"
	local main_file="/etc/caddy/Caddyfile"
	local snippet_dir snippet_file import_line content
	remote_step_begin "configure caddy"

	log "configuring caddy for ${domain}"

	# Clean up any old snippet files from previous deployments to avoid
	# duplicate site definitions when the import strategy changes.
	sudo_run rm -f /etc/caddy/conf.d/${SERVICE_NAME}.caddy /etc/caddy/Caddyfile.d/${SERVICE_NAME}.caddy

	snippet_dir="$(detect_caddy_snippet_dir)" || true
	if [[ -n "$snippet_dir" ]]; then
		snippet_file="${snippet_dir}/${SERVICE_NAME}.caddy"
		import_line="import ${snippet_dir}/*.caddy"
		sudo_run install -d -m 0755 "$snippet_dir"
	else
		snippet_file="/etc/caddy/${SERVICE_NAME}.caddy"
		import_line="import /etc/caddy/${SERVICE_NAME}.caddy"
	fi

	content="${managed_marker}
${domain} {
	${CADDY_EMAIL:+tls ${CADDY_EMAIL}}
	encode zstd gzip

	handle_path /ws/* {
		reverse_proxy localhost:${ws_port}
	}

	handle {
		reverse_proxy localhost:${ui_port}
	}
}"
	write_managed_file "$snippet_file" "$content"

	if [[ ! -f "$main_file" ]]; then
		write_managed_file "$main_file" "${managed_marker}
${import_line}"
		return 0
	fi

	# If the Caddyfile already imports our file or snippet directory,
	# there's nothing more to do.
	if grep -qE '^[[:space:]]*import[[:space:]].*(/etc/caddy/)?(conf\.d|Caddyfile\.d)/\*\.caddy' "$main_file" \
		|| grep -qF "import /etc/caddy/${SERVICE_NAME}.caddy" "$main_file"; then
		log "Caddyfile already imports our snippet; leaving it unchanged"
		if command -v caddy >/dev/null 2>&1; then
			sudo_run caddy validate --config "$main_file"
		fi
		remote_step_done
		return 0
	fi

	# If the Caddyfile was previously created by us, add the import line.
	if grep -qF "$managed_marker" "$main_file" 2>/dev/null; then
		log "Caddyfile is managed by xmpp-p2p; adding import"
		local current_content
		current_content="$(sudo_run cat "$main_file")"
		write_managed_file "$main_file" "${current_content}

${import_line}"
		if command -v caddy >/dev/null 2>&1; then
			sudo_run caddy validate --config "$main_file"
		fi
		remote_step_done
		return 0
	fi

	# Unmanaged Caddyfile with no existing import — write our snippet file
	# but do NOT modify the main Caddyfile. The config is live at the
	# snippet path; the admin must add the import manually.
	warn "existing Caddyfile is not managed by xmpp-p2p"
	warn "snippet written to ${snippet_file}"
	warn "add this line to ${main_file} if needed:"
	warn "  ${import_line}"
	remote_step_done
}

detect_nginx_style() {
	local nginx_main="/etc/nginx/nginx.conf"
	if [[ -n "${XMPP_P2P_NGINX_STYLE:-}" ]]; then
		printf '%s' "$XMPP_P2P_NGINX_STYLE"
		return 0
	fi
	if [[ -f "$nginx_main" ]] && grep -qE 'include[[:space:]]+.*/conf\.d/\*\.conf;' "$nginx_main"; then
		printf '%s' "conf.d"
		return 0
	fi
	if [[ -f "$nginx_main" ]] && grep -qE 'include[[:space:]]+.*/sites-enabled/\*;' "$nginx_main"; then
		printf '%s' "sites"
		return 0
	fi
	printf '%s' "unknown"
}

configure_nginx() {
	local domain="$1"
	local ui_port="$2"
	local ws_port="$3"
	local style
	local nginx_main="/etc/nginx/nginx.conf"
	style="$(detect_nginx_style)"

	log "configuring nginx for ${domain}"
	remote_step_begin "configure nginx"
	case "$style" in
		conf.d)
			local conf_file="/etc/nginx/conf.d/${SERVICE_NAME}.conf"
			local content
			content="${managed_marker}
server {
	listen 80;
	server_name ${domain};

	location / {
		proxy_pass http://127.0.0.1:${ui_port};
		proxy_http_version 1.1;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection \"upgrade\";
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_read_timeout 3600;
		proxy_send_timeout 3600;
	}

	location /ws {
		proxy_pass http://127.0.0.1:${ws_port};
		proxy_http_version 1.1;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection \"upgrade\";
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_read_timeout 3600;
		proxy_send_timeout 3600;
	}
}"
			write_managed_file "$conf_file" "$content"
			;;
		sites)
			local sites_available="/etc/nginx/sites-available/${SERVICE_NAME}.conf"
			local sites_enabled="/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"
			local content
			content="${managed_marker}
server {
	listen 80;
	server_name ${domain};

	location / {
		proxy_pass http://127.0.0.1:${ui_port};
		proxy_http_version 1.1;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection \"upgrade\";
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_read_timeout 3600;
		proxy_send_timeout 3600;
	}

	location /ws {
		proxy_pass http://127.0.0.1:${ws_port};
		proxy_http_version 1.1;
		proxy_set_header Upgrade \$http_upgrade;
		proxy_set_header Connection \"upgrade\";
		proxy_set_header Host \$host;
		proxy_set_header X-Real-IP \$remote_addr;
		proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
		proxy_set_header X-Forwarded-Proto \$scheme;
		proxy_read_timeout 3600;
		proxy_send_timeout 3600;
	}
}"
			write_managed_file "$sites_available" "$content"
			if [[ -e "$sites_enabled" && ! -L "$sites_enabled" ]]; then
				die "${sites_enabled} exists and is not a symlink; refusing to overwrite"
			fi
			if [[ -L "$sites_enabled" ]]; then
				local current_target
				current_target="$(readlink "$sites_enabled")"
				if [[ "$current_target" != "$sites_available" ]]; then
					die "${sites_enabled} points to ${current_target}; refusing to change it"
				fi
			else
				sudo_run ln -s "$sites_available" "$sites_enabled"
			fi
			;;
		unknown)
			warn "/etc/nginx/nginx.conf does not clearly enable conf.d or sites-enabled"
			warn "leaving nginx configuration unchanged"
			return 0
			;;
	esac

	sudo_run nginx -t
	sudo_run systemctl reload nginx 2>/dev/null || sudo_run systemctl restart nginx
	remote_step_done
}

configure_proxy() {
	case "$proxy_mode_resolved" in
		none)
			log "reverse proxy disabled"
			return 0
			;;
		caddy)
			command -v caddy >/dev/null 2>&1 || die "caddy is not installed on the remote server"
			configure_caddy "$DOMAIN" "$UI_PORT" "$WS_PORT"
			;;
		nginx)
			command -v nginx >/dev/null 2>&1 || die "nginx is not installed on the remote server"
			configure_nginx "$DOMAIN" "$UI_PORT" "$WS_PORT"
			;;
		*)
			die "unknown proxy mode: $proxy_mode_resolved"
			;;
	esac
}

verify_build_artifacts() {
	if [[ "${DRY_RUN:-false}" == true ]]; then
		return
	fi
	if [[ ! -f "${INSTALL_DIR}/ui/dist/index.html" ]]; then
		die "missing build artifact at ${INSTALL_DIR}/ui/dist/index.html"
	fi
	if [[ ! -f "${INSTALL_DIR}/dist/index.js" ]]; then
		die "missing build artifact at ${INSTALL_DIR}/dist/index.js"
	fi
	if [[ ! -f "${INSTALL_DIR}/dist/browser/bundle.js" ]]; then
		die "missing build artifact at ${INSTALL_DIR}/dist/browser/bundle.js"
	fi
}

log "normalizing ownership"
sudo_run chmod 0755 "$INSTALL_DIR"

log "stopping existing services"
sudo_run systemctl stop "${SERVICE_NAME}.service" 2>/dev/null || true
sudo_run systemctl stop "${SERVICE_NAME}-ui.service" 2>/dev/null || true

UI_PORT="$(find_available_port "$UI_PORT")"
P2P_PORT="$(find_available_port "$P2P_PORT")"
WS_PORT=$((P2P_PORT + 1000))

verify_build_artifacts

install_services

log "reloading systemd"
sudo_run systemctl daemon-reload
sudo_run systemctl reset-failed "${SERVICE_NAME}.service" 2>/dev/null || true
sudo_run systemctl reset-failed "${SERVICE_NAME}-ui.service" 2>/dev/null || true
sudo_run systemctl enable "${SERVICE_NAME}.service"
sudo_run systemctl enable "${SERVICE_NAME}-ui.service"
sudo_run systemctl start "${SERVICE_NAME}.service"
sudo_run systemctl start "${SERVICE_NAME}-ui.service"

remote_step_begin "smoke test (UI)"
wait_for_ready "${SERVICE_NAME}-ui" "$UI_PORT"
curl -fsS "http://127.0.0.1:${UI_PORT}/" >/dev/null
curl -fsS "http://127.0.0.1:${UI_PORT}/some-nonexistent-path" >/dev/null
remote_step_done

configure_proxy

log "deployment complete"
EOF
)"
	local remote_script_file
	remote_script_file="$(mktemp)"
	printf '%s\n' "$remote_script" >"$remote_script_file"
	if [[ "$DRY_RUN" == true ]]; then
		local remote_args
		printf -v remote_args '%q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q %q' \
			"$INSTALL_DIR" "$REMOTE_STAGE_DIR" "$SERVICE_NAME" "$SERVICE_USER" "$SERVICE_GROUP" \
			"$P2P_PORT" "$UI_PORT" "$UPLOAD_PORT" "$UPLOAD_HOST" \
			"$ENABLE_RELAY" "$ENABLE_WEBRTC" \
			"$COMPONENT_HOST" "$COMPONENT_PORT" "$COMPONENT_SECRET" "$COMPONENT_DOMAIN" \
			"$S2S_DOMAIN" "$PASSPHRASE" \
			"$PROXY_MODE" "$DOMAIN" "$CADDY_EMAIL"
		printf '[dry-run] scp -P %s -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=%q %q %q:%q\n' \
			"$SSH_PORT" "$SSH_CONTROL_PATH" "$remote_script_file" "$SSH_TARGET" "/tmp/${SERVICE_NAME}-deploy.sh"
		printf '[dry-run] ssh -tt -p %s -o ControlMaster=auto -o ControlPersist=10m -o ControlPath=%q %q bash %q %s\n' \
			"$SSH_PORT" "$SSH_CONTROL_PATH" "$SSH_TARGET" "/tmp/${SERVICE_NAME}-deploy.sh" "$remote_args"
		rm -f "$remote_script_file"
		step_done
		return 0
	fi
	open_ssh_master
	scp -P "$SSH_PORT" \
		-o "ControlMaster=auto" \
		-o "ControlPersist=10m" \
		-o "ControlPath=${SSH_CONTROL_PATH}" \
		"$remote_script_file" "$SSH_TARGET:/tmp/${SERVICE_NAME}-deploy.sh"
	rm -f "$remote_script_file"
	ssh -tt -p "$SSH_PORT" \
		-o "ControlMaster=auto" \
		-o "ControlPersist=10m" \
		-o "ControlPath=${SSH_CONTROL_PATH}" \
		"$SSH_TARGET" "bash /tmp/${SERVICE_NAME}-deploy.sh $(printf '%q ' "$INSTALL_DIR" "$REMOTE_STAGE_DIR" "$SERVICE_NAME" "$SERVICE_USER" "$SERVICE_GROUP" "$P2P_PORT" "$UI_PORT" "$UPLOAD_PORT" "$UPLOAD_HOST" "$ENABLE_RELAY" "$ENABLE_WEBRTC" "$COMPONENT_HOST" "$COMPONENT_PORT" "$COMPONENT_SECRET" "$COMPONENT_DOMAIN" "$S2S_DOMAIN" "$PASSPHRASE" "$PROXY_MODE" "$DOMAIN" "$CADDY_EMAIL")"
	step_done
}

while [[ $# -gt 0 ]]; do
	case "$1" in
		--host)
			SSH_TARGET="${2:-}"
			shift 2
			;;
		--p2p-port)
			P2P_PORT="${2:-}"
			shift 2
			;;
		--ui-port)
			UI_PORT="${2:-}"
			shift 2
			;;
		--upload-port)
			UPLOAD_PORT="${2:-}"
			shift 2
			;;
		--upload-host)
			UPLOAD_HOST="${2:-}"
			shift 2
			;;
		--relay)
			ENABLE_RELAY=true
			shift
			;;
		--webrtc)
			ENABLE_WEBRTC=true
			shift
			;;
		--component-host)
			COMPONENT_HOST="${2:-}"
			shift 2
			;;
		--component-port)
			COMPONENT_PORT="${2:-}"
			shift 2
			;;
		--component-secret)
			COMPONENT_SECRET="${2:-}"
			shift 2
			;;
		--component-domain)
			COMPONENT_DOMAIN="${2:-}"
			shift 2
			;;
		--s2s-domain)
			S2S_DOMAIN="${2:-}"
			shift 2
			;;
		--passphrase)
			PASSPHRASE="${2:-}"
			shift 2
			;;
		--install-dir)
			INSTALL_DIR="${2:-}"
			shift 2
			;;
		--service-user)
			SERVICE_USER="${2:-}"
			shift 2
			;;
		--service-group)
			SERVICE_GROUP="${2:-}"
			shift 2
			;;
		--proxy)
			PROXY_MODE="${2:-}"
			shift 2
			;;
		--domain)
			DOMAIN="${2:-}"
			shift 2
			;;
		--caddy-email)
			CADDY_EMAIL="${2:-}"
			shift 2
			;;
		--ssh-port)
			SSH_PORT="${2:-}"
			shift 2
			;;
		--skip-build)
			SKIP_BUILD=true
			shift
			;;
		--dry-run)
			DRY_RUN=true
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			die "unknown option: $1"
			;;
	esac
done

if [[ -z "$SSH_TARGET" ]]; then
	SSH_TARGET="${XMPP_P2P_SSH_TARGET:-}"
fi
if [[ -z "$SSH_TARGET" ]]; then
	usage
	die "missing required option: --host"
fi

if [[ "$P2P_PORT" == "4000" && -n "${XMPP_P2P_PORT:-}" ]]; then
	P2P_PORT="$XMPP_P2P_PORT"
fi
if [[ "$UI_PORT" == "3000" && -n "${XMPP_UI_PORT:-}" ]]; then
	UI_PORT="$XMPP_UI_PORT"
fi
if [[ "$UPLOAD_PORT" == "0" && -n "${XMPP_UPLOAD_PORT:-}" ]]; then
	UPLOAD_PORT="$XMPP_UPLOAD_PORT"
fi
if [[ "$UPLOAD_HOST" == "127.0.0.1" && -n "${XMPP_UPLOAD_HOST:-}" ]]; then
	UPLOAD_HOST="$XMPP_UPLOAD_HOST"
fi
if [[ "$ENABLE_RELAY" == false && -n "${XMPP_RELAY:-}" ]]; then
	is_true "$XMPP_RELAY" && ENABLE_RELAY=true || true
fi
if [[ "$ENABLE_WEBRTC" == false && -n "${XMPP_WEBRTC:-}" ]]; then
	is_true "$XMPP_WEBRTC" && ENABLE_WEBRTC=true || true
fi
if [[ -z "$COMPONENT_HOST" ]]; then
	COMPONENT_HOST="${XMPP_COMPONENT_HOST:-}"
fi
if [[ "$COMPONENT_PORT" == "5347" && -n "${XMPP_COMPONENT_PORT:-}" ]]; then
	COMPONENT_PORT="$XMPP_COMPONENT_PORT"
fi
if [[ -z "$COMPONENT_SECRET" ]]; then
	COMPONENT_SECRET="${XMPP_COMPONENT_SECRET:-}"
fi
if [[ -z "$COMPONENT_DOMAIN" ]]; then
	COMPONENT_DOMAIN="${XMPP_COMPONENT_DOMAIN:-}"
fi
if [[ -z "$S2S_DOMAIN" ]]; then
	S2S_DOMAIN="${XMPP_S2S_DOMAIN:-}"
fi
if [[ -z "$PASSPHRASE" ]]; then
	PASSPHRASE="${XMPP_PASSPHRASE:-}"
fi
if [[ "$INSTALL_DIR" == "/var/www/xmpp-p2p" && -n "${XMPP_P2P_INSTALL_DIR:-}" ]]; then
	INSTALL_DIR="$XMPP_P2P_INSTALL_DIR"
fi
if [[ "$SERVICE_USER" == "www-data" && -n "${XMPP_P2P_SERVICE_USER:-}" ]]; then
	SERVICE_USER="$XMPP_P2P_SERVICE_USER"
fi
if [[ "$SERVICE_GROUP" == "www-data" && -n "${XMPP_P2P_SERVICE_GROUP:-}" ]]; then
	SERVICE_GROUP="$XMPP_P2P_SERVICE_GROUP"
fi
if [[ "$PROXY_MODE" == "auto" && -n "${XMPP_P2P_PROXY:-}" ]]; then
	PROXY_MODE="$XMPP_P2P_PROXY"
fi
if [[ -z "$DOMAIN" ]]; then
	DOMAIN="${XMPP_P2P_DOMAIN:-}"
fi
if [[ -z "$CADDY_EMAIL" ]]; then
	CADDY_EMAIL="${XMPP_P2P_CADDY_EMAIL:-}"
fi
if [[ "$SSH_PORT" == "22" && -n "${XMPP_P2P_SSH_PORT:-}" ]]; then
	SSH_PORT="$XMPP_P2P_SSH_PORT"
fi
if [[ "$DRY_RUN" == false && -n "${XMPP_P2P_DRY_RUN:-}" ]]; then
	is_true "$XMPP_P2P_DRY_RUN" && DRY_RUN=true || true
fi
if [[ "$SKIP_BUILD" == false && -n "${XMPP_P2P_SKIP_BUILD:-}" ]]; then
	is_true "$XMPP_P2P_SKIP_BUILD" && SKIP_BUILD=true || true
fi

proxy_mode_resolved="$PROXY_MODE"

trap 'on_error $? $LINENO' ERR

if [[ "$DRY_RUN" == true ]]; then
	log "performing dry-run deployment"
fi

if [[ ! -t 0 ]]; then
	log "non-interactive tty"
else
	TTY_AVAILABLE=true
fi

render_header

build_app
sync_app
install_remote_service

log "done"
