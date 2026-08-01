# 09 — Deployment (Bare VPS, not a PaaS)

Deploy to a plain Ubuntu VPS (e.g. OVHCloud, Hetzner, DigitalOcean) with Nginx + PM2 + MySQL, rather than Vercel/a managed PaaS. This is a deliberate choice, not a limitation to work around: self-hosted media (file 04) needs a persistent disk outside the deploy pipeline, and the native `sharp`/`ffmpeg` binaries (file 01/04) are easier to get right with full control over the Node environment. There is no Docker, no `vercel.json`, and no PM2 ecosystem file committed to the repo — the ecosystem config is generated once, directly on the server.

## Architecture

```
Internet → Nginx (reverse proxy, TLS termination, static /media serving) → PM2 (cluster of Next.js workers) → MySQL (localhost)
```

## Setup sequence

1. **Provision the VPS** — Ubuntu 22.04 LTS, size it for at least 2 app workers + MySQL headroom (4GB RAM is workable for a small store; add 2GB swap if RAM is tight).
2. **Harden SSH** — keep password auth if that's your access method, but enable `fail2ban` and rate-limit new SSH connections via UFW (`ufw limit ssh`, not just `allow`, for a second layer of brute-force protection). Confirm your deploy user has passwordless `sudo`.
3. **Firewall** — UFW allowing only SSH, HTTP, HTTPS. Enable SSH access *before* turning UFW on, or you'll lock yourself out.
4. **Install Node.js 20 LTS.**
5. **Install and secure MySQL 8** — run the interactive security script, then tune `innodb_buffer_pool_size` to roughly 25% of available RAM, and cap `max_connections` to comfortably cover `(number of PM2 workers) × (mysql2 pool's connectionLimit)` with headroom for admin/diagnostic connections.
6. **Create the app database and a dedicated MySQL user** scoped to only that database (not root).
7. **Install PM2 globally and Nginx.**
8. **Create the persistent uploads directory outside the git checkout** (e.g. `/var/www/yourapp/shared/uploads/{originals,cache,videos}`), owned by the deploy user so the app can write without `sudo`. This is the directory `MEDIA_DIR` will point to.
9. **Clone the repo** into e.g. `/var/www/yourapp/app` via a deploy key (read-only GitHub deploy key, not a personal SSH key).
10. **Write `.env.local`** with every variable from file 01's list, using real production values. Key points to get right:
    - `DATABASE_URL` pointing at the local MySQL instance (same host, no network latency).
    - `MEDIA_DIR` pointing at the persistent directory from step 8.
    - `AUTH_SECRET` — 32+ random bytes.
    - `ADMIN_SECRET_KEY` / `INTERNAL_API_KEY` / `CRON_SECRET` — independent long random secrets.
    - `TRUSTED_PROXY_HOPS=1` (Nginx is the single hop in front of Next.js).
    - Razorpay **live** keys (not test-mode) for production.
11. **Push the schema**: `npm run db:push`, then apply any hand-written manual SQL migrations (the FULLTEXT index from file 02, and any other one-off `scripts/migrate-*.mjs` you accumulate over time), then seed the `counters` row and the single `design_configs` row (both required — file 02/05/06 note what breaks without them).
12. **Set at least one `SUPER_ADMIN` user** — either via a one-off script that updates a signed-up user's role, or a direct SQL update.
13. **Build**: `npm run build` (webpack, not Turbopack — see file 01). If the build OOMs on a small VPS, confirm swap is active before increasing instance size.
14. **Start with PM2** — generate an `ecosystem.config.js` **on the server** (not committed to git) running the app in cluster mode across 2 workers, pointing at `npm run start` with the correct `PORT`/env file. `pm2 save` + `pm2 startup` so it survives a reboot.
15. **Configure Nginx as a reverse proxy** — proxy `/ ` to the PM2 cluster; consider serving `/media/*` and `/media/videos/*` directly via an Nginx `alias` to the uploads directory for static originals (bypassing Next entirely for the common case), letting the Next.js on-demand-resize route (file 04) only handle first-request resizing. Add a rate-limiting zone at the Nginx layer as a second line of defense alongside the app-level limiter from file 10. Set `client_max_body_size` to match (or exceed) the video-upload body-size limit from file 01/04.
16. **Issue a TLS certificate** (Certbot/Let's Encrypt), confirm auto-renewal works (`certbot renew --dry-run`).
17. **Point DNS** at the VPS IP.
18. **Set up automatic MySQL backups** — a nightly cron dumping + gzipping the database, retained for at least a week.
19. **Configure external services** — Upstash Redis (optional but recommended), Gmail app-password or business SMTP, Razorpay live keys.
20. **Smoke test**: PM2 workers online, HTTPS responds 200, cert validity ~90 days out, a real signup → checkout → order flow works end to end.
21. **Courier account setup** (if using Delhivery or similar) — register the seller account, add and verify the exact pickup-warehouse name (file 07's pickup-location gotcha), obtain the API token, then add the polling-sync cron (step below) as the guaranteed-to-work fallback even if webhook registration is flaky on your account tier.

## Cron wiring (external crontab, not in-app)

Every `/api/cron/*` route from file 08 needs a crontab entry on the VPS hitting it with the bearer token, e.g.:
```
*/30 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/delhivery-sync
0 */2 * * *  curl -s -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/abandon-cart
*/15 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/release-stock-reservations
0 9 * * *    curl -s -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/stock-alert
0 * * * *    curl -s -H "Authorization: Bearer $CRON_SECRET" https://yourdomain.com/api/cron/currency-refresh
```
Tune intervals to your traffic; `release-stock-reservations` and `delhivery-sync` benefit from running frequently (every 15–30 min), the rest are fine hourly/daily.

## Ongoing deployment (redeploying updates)

```bash
git pull
npm install                 # only if package.json changed
npm run db:push             # only if src/db/schema.ts changed
npm run build
pm2 reload yourapp          # zero-downtime rolling restart across workers
```
`pm2 reload` (not `restart`) is what makes this zero-downtime — it restarts workers one at a time, keeping at least one serving traffic throughout.

## Troubleshooting patterns worth building runbook notes for

- **Build OOMs on a small VPS** → check swap is active before scaling the instance.
- **502 Bad Gateway** → PM2 workers likely crashed or aren't listening on the port Nginx expects; check `pm2 logs`.
- **Uploaded images 404 on `/media/`** → check the Nginx `alias` path ends in the right trailing slash and matches `MEDIA_DIR/originals/`, and that `MEDIA_DIR` itself is set correctly in the env file the running PM2 process actually loaded.
- **DB "access denied" after a fresh deploy** → confirm `DATABASE_URL`'s credentials match the MySQL user created in setup step 6, and that user has grants on the actual database name.

## Verification

- `pm2 list` shows all workers `online`, not `errored`.
- `curl -I https://yourdomain.com` returns `HTTP/2 200`.
- A cron route hit manually with the correct bearer token returns a sane JSON summary; without it, 401.
- Kill one PM2 worker manually mid-request-load — the site stays up (proving the cluster, not a single process, is actually serving traffic).
- Confirm a nightly backup file exists and has non-zero size after the first scheduled run.
