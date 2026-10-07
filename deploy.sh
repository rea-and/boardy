#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_DIR"

MAIL_SETUP=0
case "${1:-}" in
  '') ;;
  --setup-mail) MAIL_SETUP=1 ;;
  --help|-h)
    cat <<'HELP'
Usage: ./deploy.sh [--setup-mail]

Deploy Boardy from origin/main, run checks, restart the systemd service,
and verify the health endpoint.

Use --setup-mail once to configure Postfix as an authenticated SMTP relay.
The relay defaults to smtp.gmail.com:587 and can be changed with:
  BOARDY_SMTP_HOST
  BOARDY_SMTP_PORT
  BOARDY_SMTP_USERNAME
  BOARDY_SMTP_PASSWORD (optional; otherwise prompted securely)
  BOARDY_MAIL_FROM
HELP
    exit 0
    ;;
  *)
    echo "Unknown option: $1 (use --help for usage)." >&2
    exit 2
    ;;
esac

as_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo "$@"
  fi
}

configure_mail() {
  if [ "$MAIL_SETUP" -ne 1 ]; then
    return
  fi

  local relay_host="${BOARDY_SMTP_HOST:-smtp.gmail.com}"
  local relay_port="${BOARDY_SMTP_PORT:-587}"
  local username="${BOARDY_SMTP_USERNAME:-}"
  local password="${BOARDY_SMTP_PASSWORD:-}"
  local mail_from="${BOARDY_MAIL_FROM:-}"

  if [ -z "$username" ]; then
    if [ ! -t 0 ]; then
      echo "BOARDY_SMTP_USERNAME is required when --setup-mail is not interactive." >&2
      exit 2
    fi
    read -r -p "SMTP username/email: " username
  fi
  if [ -z "$password" ]; then
    if [ ! -t 0 ]; then
      echo "BOARDY_SMTP_PASSWORD is required when --setup-mail is not interactive." >&2
      exit 2
    fi
    read -r -s -p "SMTP password or app password: " password
    printf '\n'
  fi
  if [ -z "$mail_from" ]; then
    if [ ! -t 0 ]; then
      echo "BOARDY_MAIL_FROM is required when --setup-mail is not interactive." >&2
      exit 2
    fi
    read -r -p "From address [$username]: " mail_from
    mail_from="${mail_from:-$username}"
  fi

  if [[ "$relay_host" == *$'\r'* || "$relay_host" == *$'\n'* || "$username" == *$'\r'* || "$username" == *$'\n'* || "$mail_from" == *$'\r'* || "$mail_from" == *$'\n'* || "$mail_from" == *'"'* || "$mail_from" == *'\\'* ]]; then
    echo "SMTP and sender settings may not contain newlines, quotes, or backslashes." >&2
    exit 2
  fi
  if [[ "$username" != *@* || "$mail_from" != *@* ]]; then
    echo "SMTP username and BOARDY_MAIL_FROM must contain an email address." >&2
    exit 2
  fi

  echo "Installing Postfix and SMTP authentication support..."
  as_root env DEBIAN_FRONTEND=noninteractive apt-get update
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y postfix libsasl2-modules ca-certificates

  echo "Configuring authenticated SMTP relay ${relay_host}:${relay_port}..."
  as_root postconf -e "relayhost = [${relay_host}]:${relay_port}"
  as_root postconf -e 'smtp_sasl_auth_enable = yes'
  as_root postconf -e 'smtp_sasl_password_maps = hash:/etc/postfix/sasl_passwd'
  as_root postconf -e 'smtp_sasl_security_options = noanonymous'
  as_root postconf -e 'smtp_tls_security_level = encrypt'
  as_root postconf -e 'smtp_tls_CAfile = /etc/ssl/certs/ca-certificates.crt'

  # Google app passwords are commonly displayed with spaces. They are not
  # part of the credential and would otherwise split the Postfix map value.
  if [[ "$relay_host" == "smtp.gmail.com" || "$relay_host" == "smtp-relay.gmail.com" ]]; then
    password="${password// /}"
  fi
  printf '%s\n' "[${relay_host}]:${relay_port} ${username}:${password}" | as_root tee /etc/postfix/sasl_passwd >/dev/null
  as_root chmod 600 /etc/postfix/sasl_passwd
  as_root postmap /etc/postfix/sasl_passwd
  as_root chmod 600 /etc/postfix/sasl_passwd.db
  as_root systemctl enable --now postfix
  as_root postfix check

  # Keep the sender in a systemd drop-in so deploys do not overwrite the
  # service unit and the SMTP secret never enters the Boardy environment.
  as_root mkdir -p /etc/systemd/system/boardy.service.d
  printf '[Service]\nEnvironment="BOARDY_MAIL_FROM=%s"\n' "$mail_from" | as_root tee /etc/systemd/system/boardy.service.d/mail.conf >/dev/null
  as_root chmod 640 /etc/systemd/system/boardy.service.d/mail.conf
  as_root systemctl daemon-reload
  as_root systemctl restart postfix
  echo "SMTP relay configured. The password is stored in /etc/postfix/sasl_passwd."
}

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Working tree has uncommitted changes. Commit or stash them before deploying." >&2
  exit 1
fi

echo "Pulling origin/main..."
git pull --ff-only origin main

configure_mail

echo "Running Boardy checks..."
npm run check

echo "Restarting Boardy..."
as_root systemctl restart boardy
as_root systemctl is-active --quiet boardy

echo "Waiting for Boardy health..."
healthy=0
for attempt in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:4173/api/health >/dev/null; then
    healthy=1
    break
  fi
  sleep 1
done

if [ "$healthy" -ne 1 ]; then
  echo "Boardy did not become healthy within 30 seconds." >&2
  as_root systemctl status boardy --no-pager >&2 || true
  exit 1
fi

curl --fail --silent --show-error http://127.0.0.1:4173/api/health
printf '\nDeployment complete.\n'
