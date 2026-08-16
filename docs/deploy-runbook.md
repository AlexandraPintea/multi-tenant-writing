# Deploying alexandrapintea.eu

The first deploy, start to finish. Everything the repository can provide is
already built — production settings, both images, `docker-compose.prod.yml`,
the two nginx configs. What is left is a server, and this is the order to do it
in.

**Scope.** alexandrapintea.eu only. roamliterary.com stays on Squarespace: it
has no nginx server block and is not in `ALLOWED_HOSTS`, so nothing here touches
it.

**The shape of it.** Steps 1–6 are reversible and invisible to readers — the
site is built and tested on the new server while Squarespace keeps serving.
Step 7 is the cutover. Do 1–6 unhurried, on any evening; do 7 when you have an
hour and nothing else on.

---

## 0. Before you start

- [ ] A Hetzner Cloud account.
- [ ] Access to the DNS records for alexandrapintea.eu at your registrar.
- [ ] An SSH key. On Windows: `ssh-keygen -t ed25519 -C "alexandra@laptop"`,
      then the public half is in `C:\Users\<you>\.ssh\id_ed25519.pub`.
- [ ] A Backblaze B2 account for backups (free tier is plenty). Optional for
      launch, but do not leave it long.
- [ ] Roughly an hour for steps 1–6, and a separate quiet hour for step 7.

Two values to generate now and keep somewhere safe:

```powershell
# A fresh SECRET_KEY — never reuse the development one
cd backend
.\.venv\Scripts\python.exe -c "from django.core.management.utils import get_random_secret_key as k; print(k())"
```

and a strong Postgres password (any password manager will make one).

---

## 1. Provision the server

- [ ] Hetzner Cloud → new project → **Add Server**.
- [ ] Location: **Falkenstein** or **Nuremberg** (Germany) — both are in the EU,
      which is what the privacy notice tells readers. Helsinki is equally fine;
      Ashburn and Singapore are **not**, and would make the notice untrue.
- [ ] Image: **Ubuntu 24.04 LTS**.
- [ ] Type: **CX22** (2 vCPU, 4GB, 40GB) — sized in the architecture doc, and
      what the 512MB Node heap cap in `frontend/Dockerfile` assumes.
- [ ] SSH key: paste your public key. Do **not** enable a root password.
- [ ] Backups: tick them (20% of server cost). These are Hetzner's snapshots —
      useful, but not a substitute for step 9's off-site dumps: a snapshot of a
      corrupted database is a corrupted database.
- [ ] Note the IPv4 address. Everything below calls it `<VPS_IP>`.

**Verify.** `ssh root@<VPS_IP>` gets you in without a password prompt.

---

## 2. Harden it

All as `root`, first connection.

```bash
# A user to work as, in the sudo group
adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
```

- [ ] **Open a second terminal** and confirm `ssh deploy@<VPS_IP>` works
      *before* going further. Everything below can lock you out.

```bash
# Passwordless sudo is not wanted; give deploy a password to sudo with
passwd deploy

# Turn off root login and passwords entirely
sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh
```

- [ ] From the **second terminal** (still open as `deploy`), run `sudo -v`. If
      that works, the root session can be closed. If it does not, fix it from
      the session you still have — this is the one step where a mistake means a
      trip to Hetzner's web console.

Then, as `deploy`:

```bash
sudo apt update && sudo apt upgrade -y

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose

sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd

sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades   # answer Yes
```

**Verify.** `sudo ufw status` lists only 22, 80 and 443. `sudo fail2ban-client
status sshd` shows the jail watching.

> **A thing to know about Docker and ufw.** Docker writes its own iptables
> rules and can publish a port straight past ufw. That is exactly why every
> port in `docker-compose.prod.yml` is written `127.0.0.1:8000:8000` rather
> than `8000:8000`. Do not "simplify" those.

---

## 3. Docker, nginx, certbot

```bash
# Docker from its own repository, not Ubuntu's docker.io, which lags badly
sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker deploy
newgrp docker            # or log out and back in

sudo apt install -y nginx certbot python3-certbot-nginx
```

**Verify.** `docker run --rm hello-world` works **without sudo**. `nginx -v` and
`certbot --version` both answer. `curl -I http://<VPS_IP>` returns nginx's
default page.

---

## 4. The code and the environment file

```bash
sudo mkdir -p /opt/app
sudo chown deploy:deploy /opt/app
git clone https://github.com/AlexandraPintea/multi-tenant-writing.git /opt/app
cd /opt/app

# The directories nginx serves from, owned by the uid inside the backend image
mkdir -p media staticfiles
sudo chown -R 1000:1000 media staticfiles
```

Write `/opt/app/.env` (`nano .env`), using the production half of
`.env.example` as the guide:

```ini
SECRET_KEY=<the fresh one you generated>
ALLOWED_HOSTS=alexandrapintea.eu,www.alexandrapintea.eu,backend
CSRF_TRUSTED_ORIGINS=https://alexandrapintea.eu,https://www.alexandrapintea.eu
DEFAULT_SITE_DOMAIN=alexandrapintea.eu
SECURE_HSTS_SECONDS=3600
POSTGRES_DB=writing
POSTGRES_USER=writing
POSTGRES_PASSWORD=<the strong one>
```

- [ ] `chmod 600 .env` — it holds the database password.

Three things here bite if they are wrong:

- **`backend` in `ALLOWED_HOSTS`** is not a typo. It is the Host the SSR
  container sends when it calls the API across the compose network, and Django
  checks Host before anything looks at the tenant header. Without it every
  server-rendered page fails.
- **`CSRF_TRUSTED_ORIGINS` needs the scheme.** A bare hostname there fails
  every admin login with nothing on screen explaining why.
- **`SECURE_HSTS_SECONDS=3600`** stays at an hour until TLS has been stable for
  a week. HSTS is cached by browsers and cannot be taken back quickly.

---

## 5. Bring the stack up — before DNS

Squarespace is still serving the domain. Nothing here is visible to anyone.

```bash
cd /opt/app
docker compose -f docker-compose.prod.yml up -d --build   # first build: 5–10 min
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f         # watch for ~30s, then Ctrl-C
```

**Verify over loopback**, faking the Host header because `ALLOWED_HOSTS` does
not include the IP:

```bash
# The API. Expect 200 once step 6 has put a Site row in.
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Host: alexandrapintea.eu' -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8000/api/site-config/

# The SSR server. Expect HTML.
curl -s -H 'Host: alexandrapintea.eu' http://127.0.0.1:4000/writings | head -40
```

- [ ] `docker ps` shows three containers. Postgres has **no** published port.

> **Expect the backend to be `unhealthy` right now.** The database is empty, so
> no `Site` row matches, and `/api/site-config/` answers 500 rather than
> anything useful. It recovers by itself on the next probe once step 6 is done.
> The frontend depends on the backend having *started*, not being healthy,
> precisely so this state does not block it.

---

## 6. Move your content in

Your posts, pages, the author photo, the logo and the theme live only in the
laptop's database and in `backend/media/`, which is gitignored. Nothing in a
commit carries them.

On the laptop (PowerShell, from the repo root):

```powershell
docker exec multi-tenant-writing-db-1 pg_dump -U writing -d writing_local --no-owner --clean --if-exists > local.sql
scp local.sql deploy@<VPS_IP>:/tmp/local.sql
scp -r backend/media/* deploy@<VPS_IP>:/opt/app/media/
```

On the server:

```bash
cd /opt/app
docker compose -f docker-compose.prod.yml exec -T db \
  psql -U writing -d writing < /tmp/local.sql
rm /tmp/local.sql
sudo chown -R 1000:1000 media

# Restart so Django picks up a database that now has content
docker compose -f docker-compose.prod.yml restart backend
```

- [ ] Create your admin account on the server — the dump carries the users
      table, so your laptop login may work, but set a fresh password regardless:

```bash
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

- [ ] **Never run `seed_groups` here.** It resets two staff accounts to a
      password that is written down in this repository.

**Verify.**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: alexandrapintea.eu' \
  -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/api/site-config/   # 200
curl -s -H 'Host: alexandrapintea.eu' http://127.0.0.1:4000/writings | grep -c 'writings/'
docker inspect --format '{{.State.Health.Status}}' writing-backend-1     # healthy
```

---

## 7. DNS and TLS — the cutover

This is the irreversible one. Everything before it was private; from here
readers arrive.

**24 hours ahead:** at your registrar, lower the TTL on alexandrapintea.eu's A
records to **300 seconds**. That is what makes the switch — and any rollback —
take minutes instead of a day.

Then, in one sitting:

- [ ] Install the bootstrap nginx config. It serves port 80 and the ACME
      challenge, and nothing else. The full config cannot go first: nginx
      refuses to start naming a certificate that does not exist yet, and then
      certbot has no working nginx to reload.

```bash
cd /opt/app
sudo mkdir -p /var/www/certbot
sudo cp deploy/nginx/alexandrapintea.eu.bootstrap.conf \
        /etc/nginx/sites-available/alexandrapintea.eu.conf
sudo ln -sf /etc/nginx/sites-available/alexandrapintea.eu.conf \
            /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] **Switch the A records** at the registrar to `<VPS_IP>`: apex
      (`alexandrapintea.eu`) and `www`. If Hetzner gave you IPv6 and you want
      it, add AAAA records too — the nginx config already listens on `[::]`.

- [ ] Watch propagation: `dig +short alexandrapintea.eu @1.1.1.1` and
      `@8.8.8.8` until both return `<VPS_IP>`.

> **There is a short visible gap here**, and it is worth knowing rather than
> being surprised by. Between DNS moving and the certificate existing, anyone
> whose resolver has caught up sees the bootstrap page's plain "waiting for the
> certificate" over http. Minutes, if you run the next command immediately.
> Doing this at a quiet hour is the whole mitigation. (Avoiding it entirely
> means a DNS-01 challenge, which needs registrar API support and is not worth
> arranging for one domain.)

- [ ] Get the certificate:

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
     -d alexandrapintea.eu -d www.alexandrapintea.eu \
     --email anaalexandrapintea@gmail.com --agree-tos --no-eff-email
```

`certonly --webroot`, not `--nginx`: it writes a file and asks Let's Encrypt to
fetch it, leaving the config alone. `--nginx` would edit the file by hand, and
then what is running and what is in git would be two different things.

- [ ] Install the real config:

```bash
sudo cp deploy/nginx/alexandrapintea.eu.conf \
        /etc/nginx/sites-available/alexandrapintea.eu.conf
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] Confirm renewal is armed. It runs on a systemd timer, and it renews
      through the same webroot — which is why the port-80 block keeps its
      acme-challenge location:

```bash
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

---

## 8. Verify from the outside

From your laptop, not the server:

- [ ] `https://alexandrapintea.eu/writings` — the archive, and view-source
      shows the posts in the HTML (server-rendered, not filled in by script).
- [ ] `http://alexandrapintea.eu` redirects to https.
- [ ] `https://www.alexandrapintea.eu` redirects to the bare domain.
- [ ] A post page: body text, and **images actually load** (that is `/media/`
      being served by nginx from the bind mount).
- [ ] `/about` — the author photo appears.
- [ ] `/privacy` — the notice, with no `[ADD` or `[CONFIRM` anywhere.
- [ ] `/admin/` — **styled**, not bare HTML (that is `/static/`), and you can
      log in with the superuser from step 6.
- [ ] Post a comment as a reader. It should not appear. Approve it in the
      admin. It should appear.
- [ ] Send the contact form. The message is in the admin.
- [ ] Mobile width: the burger menu opens full-screen.
- [ ] SSL Labs (`ssllabs.com/ssltest`) — expect **A**.

If something is wrong: `docker compose -f docker-compose.prod.yml logs backend`
and `sudo tail -f /var/log/nginx/alexandrapintea.error.log`. A 502 means nginx
is up and the container behind it is not.

---

## 9. Backups, and proving they work

A backup you have never restored is a hope, not a backup.

```bash
sudo mkdir -p /opt/backups /var/backups/pg
sudo chown deploy:deploy /opt/backups /var/backups/pg
```

`/opt/backups/pg_dump.sh`:

```bash
#!/bin/sh
set -e
cd /opt/app
DATE=$(date +%F)
docker compose -f docker-compose.prod.yml exec -T db \
  pg_dump -U writing -d writing --no-owner | gzip > /var/backups/pg/$DATE.sql.gz
# Keep 7 local; B2 keeps the long tail
find /var/backups/pg -name '*.sql.gz' -mtime +7 -delete
```

Then rclone to Backblaze B2 (`sudo apt install -y rclone`, `rclone config`,
application key scoped **write-only to one bucket**):

```bash
#!/bin/sh
# /opt/backups/sync.sh
rclone sync /var/backups/pg b2:alexandrapintea-backups/pg \
  --backup-dir b2:alexandrapintea-backups/pg-trash/$(date +%F)
```

- [ ] `chmod +x /opt/backups/*.sh`, then `crontab -e`:

```cron
30 3 * * * /opt/backups/pg_dump.sh && /opt/backups/sync.sh
```

- [ ] Also back up **media** — the database dump does not contain your images:
      add `rclone sync /opt/app/media b2:alexandrapintea-backups/media` to the
      same script.

- [ ] **Restore drill, done once, now.** On the laptop: download the newest
      dump from B2, load it into a throwaway Postgres container, and confirm
      your posts are in it. Write down how long it took — that number is your
      real recovery time.

---

## 10. The 48 hours after

- [ ] Watch `sudo tail -f /var/log/nginx/alexandrapintea.access.log` now and
      then, for 5xx.
- [ ] Keep Squarespace **paid**. Pointing the A records back at it is the whole
      rollback plan, and it only works while the site is still there.
- [ ] After a clean week, raise `SECURE_HSTS_SECONDS` to `31536000` in
      `/opt/app/.env` and `docker compose -f docker-compose.prod.yml up -d
      backend`.
- [ ] Then, and only then, cancel Squarespace for alexandrapintea.eu.
      roamliterary.com stays.

---

## Rollback

At any point in step 7 or 8: point the A records back at Squarespace. With a
300-second TTL, readers are back on the old site within minutes. The VPS keeps
running with your content on it, and you can try again another evening.

---

## Redeploying later

Once it is live, a new version is:

```bash
cd /opt/app
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

The entrypoint migrates, creates the cache table and collects static on every
start, so there is nothing else to remember. Watch the logs for thirty seconds
afterwards.
