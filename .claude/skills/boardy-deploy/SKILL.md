---
name: boardy-deploy
description: Update and restart a Boardy server (systemd or Docker Compose) and verify it is healthy. Use when asked how to deploy, restart, or roll out a new version.
---

# Deploy or restart Boardy

Ask which setup is in use if it is unknown. Never run commands on the server yourself unless the user gives access; print the commands for them.

## systemd (service name `boardy`, set up by `deploy.sh`)

```bash
cd /path/to/boardy && git pull
sudo systemctl restart boardy
sudo systemctl status boardy --no-pager
journalctl -u boardy -f
curl localhost:4173/api/health      # expect {"ok":true,...}
```

## Docker Compose

```bash
cd /path/to/boardy && git pull
docker compose up -d --build        # rebuild after pulling
docker compose restart boardy       # restart only
docker compose logs -f boardy
```

## Notes to repeat to the user

- The server keeps `boardy.json` in memory. After editing or restoring the file by hand, stop and start Boardy.
- Open browser tabs must be reloaded after a deploy so they load the new `app.js`.
- Behind nginx or Caddy set `BOARDY_TRUST_PROXY=1`, otherwise sign-in rate limits apply to every user at once.
- Back up the data volume or `BOARDY_DATA_DIR` before upgrades. `docker compose down -v` deletes all data; never suggest it casually.
- Invitation email needs a local sendmail (`BOARDY_SENDMAIL_PATH`); `deploy.sh` can set up Postfix.
