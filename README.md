# Boardy

### A calm, self-hosted workspace for work that moves.

[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-1f2937?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Docker ready](https://img.shields.io/badge/Docker-ready-2563eb?logo=docker&logoColor=white)](https://www.docker.com/)
[![Self-hosted](https://img.shields.io/badge/hosting-self--hosted-0f766e)](https://github.com/rea-and/boardy)

Boardy is a focused kanban workspace inspired by the best parts of Trello, built for people who want their work, accounts, and backups on infrastructure they control.

Create boards, shape them around the way your team works, and move cards from idea to done without losing the calm, readable feel of a good workspace. Boardy works for personal planning, project delivery, recruiting pipelines, editorial calendars, product launches, and any workflow that benefits from visible progress.

It runs as a small dependency-free Node.js application, is easy to deploy with Docker or systemd, and stores workspace data locally in a portable JSON file.

## At a glance

| Organize | Collaborate | Personalize | Operate |
| --- | --- | --- | --- |
| Boards, columns, rich cards, checklists, labels, search, due dates | Email invitations, read-only or editor access, public board links | Themes, wallpapers, board colors, responsive layout, keyboard shortcuts | Accounts, secure sessions, JSON backups, Docker, systemd, reverse proxies |

## What makes Boardy useful

- **A familiar board, with room to grow.** Reorder columns and cards with drag and drop, including cards within the same column.
- **Cards that hold the real context.** Add descriptions, safe clickable URLs, labels with autocomplete, checklists, members, comments, due dates, stars, and attachments with previews.
- **Sharing with clear boundaries.** Invite people by email as read-only or editors, keep ownership with the creator, and remove access whenever needed.
- **Public when you choose.** Publish one board through a revocable read-only link without exposing an account or the rest of the workspace.
- **A workspace that feels like yours.** Choose from light and dark themes, add wallpapers, set board colors, and use a layout that works on mobile as well as desktop.
- **Portable and self-hosted.** Export the complete workspace to one backup file, keep persistent data on disk, and deploy on a small server without a separate database.

## Feature highlights

### Boards and workflow

- Multiple boards per account with human-friendly routes such as `/boardy/finance`.
- Remembered last-opened board when returning to the workspace root.
- Custom board colors and board-specific image backgrounds.
- Archive, restore, or permanently delete boards.
- Board descriptions with compact previews, card search, due-soon cards, and starred-card views.

### Rich card details

- Titles, descriptions, clickable URLs, labels, due dates, stars, assigned members, comments, and activity.
- Checklists with completion tracking, inline editing, reordering, and deletion.
- Attachments with image previews and sensible size limits.
- Duplicate, archive, and restore actions.
- Clear save feedback so edits never feel ambiguous.

### Collaboration and sharing

- Owner-controlled invitations by email.
- **Can edit** and **Read-only** member roles.
- Visible board members and shared-board markers in the sidebar.
- Revocable public read-only links for people without an account.
- Public viewers can see only the selected board and cannot make changes.

### Security and operations

- Registration and login with salted Node.js `scrypt` password hashing.
- Random HttpOnly session cookies.
- Persistent local JSON storage with portable export/import.
- Docker Compose, native Node.js, systemd, Apache, Nginx, and Caddy deployment paths.

Boardy is intentionally small and dependency-free. The browser client is served by a Node.js server, and workspace data is stored on disk in a JSON file. It can run on a small Ubuntu server without a separate database.

## The sharing model

| Role | Access |
| --- | --- |
| **Owner** | Full board access, settings, invitations, permissions, member removal, and archive/delete controls. |
| **Can edit** | Can work with board content, including cards and columns. Cannot manage access. |
| **Read-only** | Can view the shared board without changing it. |
| **Public viewer** | Can view one published board through its private link, without an account. |

Invitations use the server’s configured sendmail-compatible program. If email delivery is not configured, Boardy keeps the invitation pending and shows the owner a secure link to copy manually.

## Quick start

~~~bash
git clone https://github.com/rea-and/boardy.git
cd boardy
npm run check
npm start
~~~

Open [http://localhost:4173](http://localhost:4173), create an account, and start a board. For a development workflow with automatic restarts, run `npm run dev`.

## Requirements

- Node.js 20 or newer for a native installation.
- Git.
- An HTTPS reverse proxy for public production use.
- A writable persistent data directory.

Docker users need Docker Engine and the Docker Compose plugin instead of a host Node.js installation.

Boardy listens on port 4173 by default.

## Member invitations

Open a board and choose **Share** to invite someone by email. Select **Read-only** or **Can edit** before sending. The owner can change that permission or remove access later. Accepted members appear in the board header and Share dialog; shared boards are marked in each member’s sidebar.

Invitation links use the configured public Boardy URL. Set `BOARDY_PUBLIC_URL` to the complete externally reachable app URL, including a reverse-proxy subpath when you use one, for example `https://boardy.example.com` or `https://example.com/boardy`. Boardy sends mail through a local sendmail-compatible binary, `/usr/sbin/sendmail` by default. Install and configure an MTA such as Postfix, or set `BOARDY_SENDMAIL_PATH` to the approved sendmail-compatible delivery command. If mail is not configured, Boardy keeps the invitation pending and shows the owner a secure link to copy manually.

## Public board links

Open a board and choose **Share**, then enable **Allow public viewing**. Boardy creates a revocable, read-only link for that board. Anyone with the link can view the selected board without an account, including its lists, cards, descriptions, checklists, comments, labels, and supported image previews. Visitors cannot edit the board, open your workspace, or see any other board or account information.

Disable the toggle in the same Share dialog to revoke the link. Public links should still be shared carefully because anyone who has the link can view the board while it is enabled.

## Choose an installation method

| Method | Best for | Persistent data |
| --- | --- | --- |
| Docker Compose | Fast deployment and simple upgrades | Named Docker volume |
| Native Node.js + systemd | Full host and reverse-proxy control | Host directory |
| Native Node.js foreground process | Local development and testing | ./data |

For a public Ubuntu server, Docker Compose or native Node.js with systemd is recommended. Do not expose the application directly to the public internet without HTTPS.

## Option A: Docker Compose

### 1. Install Docker

Install Docker Engine and the Docker Compose plugin using the official instructions for your Ubuntu release. Confirm the installation:

~~~bash
docker --version
docker compose version
~~~

If your account is not allowed to run Docker without sudo, either add it to the Docker group and start a new login session or prefix Docker commands with sudo.

### 2. Clone the repository

Replace the repository URL with your own Boardy repository URL:

~~~bash
sudo mkdir -p /opt/boardy
sudo chown "$USER":"$USER" /opt/boardy
git clone <your-repository-url> /opt/boardy
cd /opt/boardy
~~~

### 3. Build and start Boardy

~~~bash
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:4173/api/health
~~~

The health response should contain:

~~~json
{"ok":true,"service":"boardy"}
~~~

For a local test, open http://SERVER_IP:4173. For production, keep port 4173 private and access Boardy through an HTTPS reverse proxy.

### 4. Docker operations

~~~bash
# Follow logs
docker compose logs -f boardy

# Restart
docker compose restart boardy

# Stop and start
docker compose stop
docker compose start

# Update the source and rebuild
git pull --ff-only
docker compose up -d --build
~~~

docker compose down removes the container but keeps the named boardy-data volume. docker compose down -v also deletes that volume and permanently removes the stored accounts and workspaces. Only use it after taking a backup and confirming that data may be deleted.

## Option B: Native Node.js with systemd

This is the recommended detailed installation for an Ubuntu server where Apache, Nginx, or Caddy will provide HTTPS.

### 1. Install system packages

~~~bash
sudo apt update
sudo apt install -y git curl ca-certificates
~~~

Install Node.js 20 or newer using your organization’s approved package source or the official Node.js distribution. Verify both Node and npm:

~~~bash
node --version
npm --version
~~~

The Node version must be 20.x or newer:

~~~bash
node -e "const major = Number(process.versions.node.split('.')[0]); if (major < 20) process.exit(1); console.log(process.versions.node)"
~~~

### 2. Create a service account and directories

Using a dedicated operating-system account prevents Boardy from running as root:

~~~bash
sudo adduser --system --group --home /opt/boardy boardy
sudo mkdir -p /opt/boardy /var/lib/boardy
sudo chown -R boardy:boardy /opt/boardy /var/lib/boardy
~~~

If the application is installed elsewhere, use that location consistently in the commands and systemd unit below.

### 3. Clone Boardy

Replace the repository URL with your own:

~~~bash
sudo -u boardy git clone <your-repository-url> /opt/boardy
sudo -u boardy npm --prefix /opt/boardy run check
~~~

Boardy has no runtime npm dependencies, so npm install is not required. npm run check validates the server and browser JavaScript.

### 4. Create the systemd service

Create /etc/systemd/system/boardy.service:

~~~ini
[Unit]
Description=Boardy kanban workspace
After=network.target

[Service]
Type=simple
User=boardy
Group=boardy
WorkingDirectory=/opt/boardy
Environment=NODE_ENV=production
Environment=PORT=4173
Environment=BOARDY_DATA_DIR=/var/lib/boardy
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
~~~

If Node.js was installed with a version manager rather than system packages, find the absolute path with command -v node and use that path in ExecStart.

Load and start the service:

~~~bash
sudo systemctl daemon-reload
sudo systemctl enable --now boardy
sudo systemctl status boardy --no-pager
~~~

Verify the local service:

~~~bash
curl -i http://127.0.0.1:4173/api/health
~~~

Useful service commands:

~~~bash
sudo systemctl restart boardy
sudo systemctl stop boardy
sudo systemctl start boardy
sudo journalctl -u boardy -f
~~~

### 5. Verify data-directory permissions

The service account must be able to create and rename files in the configured data directory:

~~~bash
sudo chown -R boardy:boardy /var/lib/boardy
sudo chmod 750 /var/lib/boardy
sudo -u boardy sh -c 'touch /var/lib/boardy/.write-test && rm /var/lib/boardy/.write-test'
~~~

Boardy writes /var/lib/boardy/boardy.json atomically. Do not put the data directory inside a publicly served web root.

## Option C: Local development

~~~bash
git clone <your-repository-url> boardy
cd boardy
npm run check
npm start
~~~

Open http://localhost:4173.

For development with automatic server restarts:

~~~bash
npm run dev
~~~

The default local data file is ./data/boardy.json. The data/ directory is ignored by Git.

## Configuration

Boardy accepts these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 4173 | HTTP port used by Boardy. |
| BOARDY_DATA_DIR | ./data | Directory containing the persistent boardy.json store. |
| NODE_ENV | unset | Set to production to add the Secure cookie attribute. |
| BOARDY_PUBLIC_URL | derived from the request | Complete public app URL used in invitation emails. Include the `/boardy` subpath when applicable. |
| BOARDY_MAIL_FROM | `Boardy <boardy@localhost>` | From header used for invitation emails. |
| BOARDY_SENDMAIL_PATH | `/usr/sbin/sendmail` | Sendmail-compatible executable used for invitation delivery. |

Example:

~~~bash
NODE_ENV=production \
PORT=4173 \
BOARDY_DATA_DIR=/var/lib/boardy \
npm start
~~~

For public HTTPS deployments, always set NODE_ENV=production.

## HTTPS and reverse proxies

The Boardy server provides HTTP locally. Put it behind an HTTPS reverse proxy for public use. The proxy should terminate TLS, forward requests to 127.0.0.1:4173, preserve the Host header, forward API requests, and keep the raw port 4173 inaccessible from the public internet.

### Caddy on a dedicated hostname

Add a site to the Caddy configuration:

~~~caddyfile
boardy.example.com {
    reverse_proxy 127.0.0.1:4173
}
~~~

Reload Caddy and confirm that the HTTPS hostname reaches Boardy.

### Nginx on a dedicated hostname

~~~nginx
server {
    listen 80;
    server_name boardy.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name boardy.example.com;

    # Configure ssl_certificate and ssl_certificate_key here.

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
~~~

Validate and reload:

~~~bash
sudo nginx -t
sudo systemctl reload nginx
~~~

### Apache under a URL path

Boardy supports being hosted below a path such as https://example.com/boardy/.

Enable the required Apache modules:

~~~bash
sudo a2enmod proxy proxy_http headers rewrite ssl
~~~

Inside the HTTPS <VirtualHost *:443> for the desired domain, add:

~~~apache
RedirectMatch permanent ^/boardy$ /boardy/

ProxyPreserveHost On
ProxyPass        /boardy/api/ http://127.0.0.1:4173/api/
ProxyPassReverse /boardy/api/ http://127.0.0.1:4173/api/
ProxyPass        /boardy/     http://127.0.0.1:4173/
ProxyPassReverse /boardy/     http://127.0.0.1:4173/

<Location "/boardy/">
    Require all granted
    RequestHeader set X-Forwarded-Proto "https"
    RequestHeader set X-Forwarded-Prefix "/boardy"
</Location>
~~~

Put the specific /boardy/api/ proxy rules before broader proxy rules for the same host. Validate and reload:

~~~bash
sudo apachectl configtest
sudo systemctl reload apache2
~~~

The final URL must include the trailing slash:

~~~text
https://example.com/boardy/
~~~

If a domain already redirects HTTP to HTTPS, use the HTTPS URL when testing cookies and authenticated changes.

## Updating a native systemd installation

The repository includes deploy.sh. It performs a fast-forward-only pull from origin/main, runs the JavaScript checks, restarts the boardy systemd service, waits for the health endpoint, and stops if the checkout has uncommitted changes.

Run it from the repository root:

~~~bash
cd /opt/boardy
./deploy.sh
~~~

The deployment account needs permission to restart the service with sudo. If the service has a different name or the repository lives elsewhere, update deploy.sh or perform the equivalent commands manually:

~~~bash
git pull --ff-only origin main
npm run check
sudo systemctl restart boardy
curl -fsS http://127.0.0.1:4173/api/health
~~~

After an update, hard-refresh the browser if cached JavaScript is still displayed.

## Data, backups, and restore

Boardy stores accounts, sessions, boards, cards, comments, attachment previews, themes, wallpapers, and layout preferences in one boardy.json file.

### In-app workspace backup

Open Customize → Backup to export the signed-in workspace to one portable JSON file. It includes boards, cards, checklist data, labels, comments, attachments, theme, wallpaper, and sidebar preferences.

Importing a backup replaces the current workspace after confirmation. Keep backup files private because they can contain board content, attachment data, and workspace information.

### Native installation backup

Stop Boardy before taking a filesystem backup:

~~~bash
sudo systemctl stop boardy
sudo tar czf boardy-data-$(date +%Y%m%d-%H%M%S).tgz -C /var/lib boardy
sudo systemctl start boardy
~~~

To restore a native backup, stop the service, move the current data directory to a safe recovery name, extract the backup, restore ownership, and start the service:

~~~bash
sudo systemctl stop boardy
sudo mv /var/lib/boardy /var/lib/boardy-before-restore
sudo mkdir -p /var/lib/boardy
sudo tar xzf boardy-data-YYYYMMDD-HHMMSS.tgz -C /var/lib
sudo chown -R boardy:boardy /var/lib/boardy
sudo systemctl start boardy
~~~

Confirm the archive layout before restoring. Do not overwrite the only copy of the current data.

### Docker backup

Find the Compose volume:

~~~bash
docker volume ls | grep boardy
~~~

Then back it up to a local backups directory:

~~~bash
mkdir -p backups
docker run --rm \
  -v boardy_boardy-data:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/boardy-data-$(date +%Y%m%d-%H%M%S).tgz -C /source .
~~~

Replace boardy_boardy-data with the actual volume name shown by docker volume ls.

Attachments are currently stored as size-limited data URLs inside the JSON store. Keep regular backups and avoid very large uploads. A larger deployment should move attachments to object storage and persistence to a transactional database.

## Health checks and troubleshooting

### Check the application directly

~~~bash
curl -i http://127.0.0.1:4173/api/health
sudo systemctl status boardy --no-pager
sudo journalctl -u boardy -n 100 --no-pager
~~~

### Check a reverse proxy

For Apache:

~~~bash
sudo apachectl configtest
sudo tail -f /var/log/apache2/<your-ssl-access-log>
sudo tail -f /var/log/apache2/<your-ssl-error-log>
~~~

For Nginx:

~~~bash
sudo nginx -t
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
~~~

When saving a Boardy change, the proxy access log should show:

~~~text
PUT /boardy/api/data HTTP/1.1" 200
~~~

Common issues:

- Unit boardy.service does not exist: create /etc/systemd/system/boardy.service, then run sudo systemctl daemon-reload.
- EACCES for the data directory: make BOARDY_DATA_DIR writable by the service account and verify with the touch test above.
- Port 4173 refuses connections after restart: wait for systemd to finish restarting and inspect sudo journalctl -u boardy -n 100 --no-pager.
- The page loads but changes do not persist: confirm the browser is using the production URL, hard-refresh it, and verify a PUT /api/data request returns 200.
- The log shows 401: the secure session cookie is missing or expired. Confirm HTTPS is active and NODE_ENV=production is set.
- The log shows 404 for /boardy/api/data: check the path-specific proxy rules and reload Apache or Nginx.
- The log shows 500: inspect the Boardy journal immediately after reproducing the action.
- The page is stale after an update: run the deployment command, then hard-refresh with Ctrl+Shift+R.
- The app starts but data appears missing: confirm that the service uses the intended BOARDY_DATA_DIR and that the backup volume or directory has not changed.

## First use

1. Open Boardy through the HTTPS URL.
2. Choose Create an account and use a valid email address and a password of at least eight characters.
3. Or choose Open the demo workspace to explore the interface without creating an account.
4. Create a board and lists, then add cards.
5. Open a card to edit descriptions, labels, due dates, checklists, members, comments, and attachments.
6. Use Customize to select a theme, wallpaper, and backup actions.
7. Export a backup before major changes or upgrades.

## Product capabilities

- Account registration, login, logout, and password hashing with Node.js scrypt.
- Multiple boards, lists, and cards.
- Card descriptions, labels, due dates, checklists, members, comments, attachments, previews, starring, duplication, and archiving.
- Drag-and-drop card movement and list reordering.
- Search and due/starred filters.
- Themes, custom wallpapers, responsive layout, and a collapsible sidebar.
- Keyboard shortcuts.
- JSON export/import workspace backups.
- Automatic persistence through the authenticated /api/data endpoint.

## Security notes

- Always use HTTPS for public deployments.
- Keep boardy.json and its containing data directory outside any web root.
- Run the service as a dedicated non-root operating-system account.
- Keep backup files private.
- Restrict direct access to port 4173 when a reverse proxy is configured.
- Do not commit data/boardy.json, credentials, session cookies, or uploaded personal files.
- The built-in JSON store is intended for a small self-hosted installation. Use a database and object storage for larger multi-user deployments.
