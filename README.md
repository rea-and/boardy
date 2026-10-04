# Boardy

Boardy is a self-hosted kanban workspace inspired by the best parts of Trello. It includes multiple boards, flexible lists, rich cards, labels, checklists, members, due dates, comments, attachments with image previews, search, starring, drag-and-drop movement, themes, and custom wallpapers.

The project is deliberately small and dependency-free: the browser client is served by a Node.js server, and workspace data is stored on disk so a single Ubuntu server can run it without a separate database.

## Requirements

Choose one of these installation paths:

- Docker Engine and Docker Compose plugin, recommended for Ubuntu production installs.
- Node.js 20 or newer, for a direct installation.

The app listens on port 4173 by default.

## Install with Docker on Ubuntu

### 1. Install Docker

On a fresh Ubuntu server, install Docker using Docker's official instructions for your Ubuntu release. Confirm that both commands work:

~~~bash
docker --version
docker compose version
~~~

### 2. Get Boardy

Replace the repository URL with the location where your Boardy source is stored:

~~~bash
git clone <your-repository-url> boardy
cd boardy
~~~

### 3. Build and start

~~~bash
docker compose up -d --build
~~~

Check the container and health endpoint:

~~~bash
docker compose ps
curl http://127.0.0.1:4173/api/health
~~~

The expected health response contains "ok":true.

Open http://your-server-ip:4173 in a browser. Choose Open the demo workspace to inspect the product, or create a real account with an email address and a password of at least eight characters.

### 4. Stop, restart, and update

~~~bash
docker compose stop
docker compose start

# Pull source changes and rebuild:
git pull
docker compose up -d --build
~~~

docker compose down removes the running container but keeps the named boardy-data volume. To remove the volume as well, use docker compose down -v; that permanently deletes the stored Boardy accounts and workspaces.

## Install directly with Node.js

### 1. Install Node.js 20+

Verify the version:

~~~bash
node --version
~~~

### 2. Start Boardy

~~~bash
git clone <your-repository-url> boardy
cd boardy
npm run check
npm start
~~~

No npm install step is required because Boardy uses only Node.js built-ins.

For development, use the file-watching server:

~~~bash
npm run dev
~~~

## Configuration

The server accepts these environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| PORT | 4173 | HTTP port for Boardy. |
| BOARDY_DATA_DIR | ./data | Directory containing the persistent boardy.json store. |
| NODE_ENV | unset | Set to production to add the Secure cookie attribute. |

Example:

~~~bash
NODE_ENV=production \
PORT=4173 \
BOARDY_DATA_DIR=/srv/boardy-data \
npm start
~~~

The Docker image sets NODE_ENV=production and stores data in /app/data, which is backed by the boardy-data Compose volume.

## HTTPS and reverse proxy

Do not expose a plain HTTP Boardy instance directly to the public internet. Put it behind an HTTPS reverse proxy. The proxy should forward requests to 127.0.0.1:4173 and preserve the Host header.

For Caddy:

~~~caddyfile
boardy.example.com {
    reverse_proxy 127.0.0.1:4173
}
~~~

For Nginx:

~~~nginx
server {
    listen 443 ssl http2;
    server_name boardy.example.com;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
~~~

### Apache under `/boardy/`

If Boardy should share `carlevato.net` with other applications, run it locally on port 4173 and proxy only the `/boardy/` path. Boardy is subpath-aware, so its assets and API requests stay under this prefix.

Enable the required Apache modules once:

~~~bash
sudo a2enmod proxy proxy_http headers rewrite ssl
~~~

Add this block inside the existing HTTPS `<VirtualHost *:443>` in `/etc/apache2/sites-available/us-calendar-ssl.conf`. Put it before any broader Boardy or root proxy rules:

~~~apache
# ------------------------------------------------------------
# Boardy at /boardy
# ------------------------------------------------------------
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

Check and reload Apache:

~~~bash
sudo apachectl configtest
sudo systemctl reload apache2
~~~

Because your port 80 virtual host redirects to HTTPS, use `https://carlevato.net/boardy/` as the final URL; `http://carlevato.net/boardy` will redirect there.

Use your certificate manager or hosting provider to provision and renew TLS certificates. Restrict the raw port 4173 with the server firewall once the proxy is working.

## Persistence and backups

Boardy stores accounts, sessions, boards, comments, and attachment previews in boardy.json.

### In-app workspace backups

Open **Customize** → **Backup** to export a single portable JSON file for the signed-in workspace. It includes every board, card, attachment preview, theme, wallpaper, and sidebar preference. Use **Import** in the same panel to restore that backup to an account; importing replaces that account's current workspace after confirmation. Keep the exported file private because attachment data and board content are included.

For the Docker install, create a backup:

~~~bash
mkdir -p backups
docker run --rm \
  -v boardy_boardy-data:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/boardy-data-$(date +%Y%m%d-%H%M%S).tgz -C /source .
~~~

The exact volume name can be checked with:

~~~bash
docker volume ls | grep boardy
~~~

For a native install, back up the configured data directory while Boardy is stopped:

~~~bash
tar czf boardy-data-backup.tgz data/
~~~

Uploaded files are currently stored as size-limited data URLs in the workspace JSON. Keep regular backups and avoid very large uploads. A future larger deployment should use object storage for attachments and a transactional database for workspace data.

## Health checks and troubleshooting

Health endpoint:

~~~bash
curl -i http://127.0.0.1:4173/api/health
~~~

View Docker logs:

~~~bash
docker compose logs -f boardy
~~~

Common fixes:

- **Port already in use:** set another host port in docker-compose.yml, for example "8080:4173", then open port 8080.
- **Container starts but data is missing:** confirm the boardy-data volume is still present with docker volume ls.
- **Login cookie does not persist behind HTTPS:** ensure the proxy is serving HTTPS and NODE_ENV=production is set.
- **The page is stale after an update:** rebuild with docker compose up -d --build and hard-refresh the browser.
- **Permission errors in native mode:** ensure the account running Node can read and write BOARDY_DATA_DIR.

## Product behavior

- Create an account or use the demo workspace.
- Create multiple boards and lists.
- Add cards through branded dialogs.
- Open cards to edit descriptions, labels, due dates, checklists, comments, members, and attachments.
- Drag cards between lists.
- Star boards and cards, then use the starred filter.
- Search across the active board.
- Switch between dark/light themes and choose a preset or uploaded wallpaper.
- Changes are saved automatically to the server.

## Security notes

- Passwords are salted and hashed with Node.js scrypt.
- Sessions use random HttpOnly cookies.
- Repeated failed authentication attempts are throttled per client address.
- Production mode adds the Secure cookie attribute.
- The server applies baseline browser security headers.
- The app does not log passwords, session tokens, or uploaded content.
- Use HTTPS, a firewall, regular backups, and a private deployment for real production use.

## Development checks

Run the syntax checks before handing off changes:

~~~bash
npm run check
~~~

The repository also includes AGENTS.md, the requested compatibility file ANGENTS.md, and CLAUDE.md with project-specific coding and deployment guidance.
