# Deploying alexandrapintea.eu

The first deploy, start to finish. Everything the repository can provide is
already built — production settings, both images, `docker-compose.prod.yml`,
the two nginx configs. What is left is a server, and this is the order to do it
in.

**Scope.** alexandrapintea.eu only. roamliterary.com stays where it is: it has
no nginx server block and is not in `ALLOWED_HOSTS`, so nothing here touches it.

**Assumed.** The Squarespace site is going away and is not coming back, the
domain registration is safe and separate from it, and a day or two of downtime
is acceptable. That is what lets this be a straight line: the domain is pointed
at the new box early, on purpose, so DNS propagates while the rest is still
being built. Nobody is watching a clock.

---

## 0. Before you start

- [ ] A Hetzner Cloud account.
- [ ] Access to the DNS panel for alexandrapintea.eu. The nameservers are
      Google's (`ns-cloud-e1..e4.googledomains.com`), so the records are edited
      wherever that zone lives — a Google account, not necessarily Squarespace.
      **Confirm you can log in and edit an A record before starting**, because
      everything from step 4 onward depends on it.
- [ ] An SSH key. On Windows: `ssh-keygen -t ed25519 -C "alexandra@laptop"`,
      then the public half is in `C:\Users\<you>\.ssh\id_ed25519.pub`.
- [ ] A Backblaze B2 account for backups (free tier is plenty). Not needed to
      go live, but do not leave it long.

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
      useful, but not a substitute for step 10's off-site dumps: a snapshot of a
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

sudo apt install -y nginx certbot
```

**Verify.** `docker run --rm hello-world` works **without sudo**. `nginx -v` and
`certbot --version` both answer. `curl -I http://<VPS_IP>` returns nginx's
default page.

---

## 4. Point the domain at the box

Early on purpose. DNS takes time to spread, and certbot cannot issue a
certificate until the name resolves here — so start it now and let it settle
while you build the rest. The site is briefly unreachable, which is fine.

First give nginx something to answer with. The bootstrap config serves port 80
and the ACME challenge and nothing else; the full config cannot go first,
because nginx refuses to start naming a certificate that does not exist yet.

```bash
sudo mkdir -p /var/www/certbot /opt/app
sudo chown deploy:deploy /opt/app
git clone https://github.com/AlexandraPintea/multi-tenant-writing.git /opt/app
cd /opt/app

sudo cp deploy/nginx/alexandrapintea.eu.bootstrap.conf \
        /etc/nginx/sites-available/alexandrapintea.eu.conf
sudo ln -sf /etc/nginx/sites-available/alexandrapintea.eu.conf \
            /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

- [ ] In the DNS panel, **replace** the four Squarespace A records on the apex
      (`198.185.159.144/145`, `198.49.23.144/145`) with a single A record →
      `<VPS_IP>`.
- [ ] Do the same for `www` — if it is currently a CNAME to Squarespace, delete
      it and add an A record to `<VPS_IP>` instead.
- [ ] Leave every other record alone. In particular, **do not touch MX or TXT
      records** if any exist: those are mail and domain verification, and this
      deploy has nothing to do with either.

**Verify**, repeating every few minutes until it agrees:

```bash
dig +short alexandrapintea.eu @1.1.1.1
dig +short www.alexandrapintea.eu @8.8.8.8
```

Both should print `<VPS_IP>`. Until they do, the rest still works — only step 8
has to wait.

---

## 5. The environment file

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
- [ ] Create the directories nginx serves from, owned by the uid inside the
      backend image:

```bash
cd /opt/app
mkdir -p media staticfiles
sudo chown -R 1000:1000 media staticfiles
```

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

## 6. Bring the stack up

```bash
cd /opt/app
docker compose -f docker-compose.prod.yml up -d --build   # first build: 5–10 min
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f         # watch for ~30s, then Ctrl-C
```

**Verify over loopback**, faking the Host header because `ALLOWED_HOSTS` does
not include the IP:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Host: alexandrapintea.eu' -H 'X-Forwarded-Proto: https' \
  http://127.0.0.1:8000/api/site-config/

curl -s -H 'Host: alexandrapintea.eu' http://127.0.0.1:4000/writings | head -40
```

- [ ] `docker ps` shows three containers. Postgres has **no** published port.

> **Expect the backend to be `unhealthy` right now.** The database is empty, so
> no `Site` row matches, and `/api/site-config/` answers 500 rather than
> anything useful. It recovers by itself on the next probe once step 7 is done.
> The frontend depends on the backend having *started*, not being healthy,
> precisely so this state does not block it.

---

## 7. Move your content in

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

# Your own admin account, with a fresh password
docker compose -f docker-compose.prod.yml exec backend python manage.py createsuperuser
```

- [ ] **Never run `seed_groups` here.** It resets two staff accounts to a
      password that is written down in this repository.

**Verify.**

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: alexandrapintea.eu' \
  -H 'X-Forwarded-Proto: https' http://127.0.0.1:8000/api/site-config/   # 200
docker inspect --format '{{.State.Health.Status}}' writing-backend-1     # healthy
```

---

## 8. The certificate, and the real nginx config

Needs step 4 to have propagated: Let's Encrypt fetches a file over http from
whatever `alexandrapintea.eu` resolves to, so the name must already point here.

```bash
sudo certbot certonly --webroot -w /var/www/certbot \
     -d alexandrapintea.eu -d www.alexandrapintea.eu \
     --email anaalexandrapintea@gmail.com --agree-tos --no-eff-email
```

`certonly --webroot`, not `--nginx`: it writes a file and asks Let's Encrypt to
fetch it, leaving the config alone. `--nginx` would edit the file by hand, and
then what is running and what is in git would be two different things.

```bash
cd /opt/app
sudo cp deploy/nginx/alexandrapintea.eu.conf \
        /etc/nginx/sites-available/alexandrapintea.eu.conf
sudo nginx -t && sudo systemctl reload nginx

# Renewal runs on a timer, through the same webroot — which is why the
# port-80 block keeps its acme-challenge location.
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

---

## 9. Verify from the outside

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
      log in with the superuser from step 7.
- [ ] Post a comment as a reader. It should not appear. Approve it in the
      admin. It should appear.
- [ ] Send the contact form. The message is in the admin.
- [ ] Mobile width: the burger menu opens full-screen.
- [ ] SSL Labs (`ssllabs.com/ssltest`) — expect **A**.

If something is wrong: `docker compose -f docker-compose.prod.yml logs backend`
and `sudo tail -f /var/log/nginx/alexandrapintea.error.log`. A 502 means nginx
is up and the container behind it is not.

---

## 10. Backups, and proving they work

A backup you have never restored is a hope, not a backup. This is the step it
is most tempting to skip now that the site is up, and the only one whose
absence is discovered at the worst possible moment.

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
# Media too — the database dump does not contain your images
rclone sync /opt/app/media b2:alexandrapintea-backups/media
```

- [ ] `chmod +x /opt/backups/*.sh`, then `crontab -e`:

```cron
30 3 * * * /opt/backups/pg_dump.sh && /opt/backups/sync.sh
```

- [ ] **Restore drill, done once.** On the laptop: download the newest dump
      from B2, load it into a throwaway Postgres container, and confirm your
      posts are in it. Write down how long it took — that number is your real
      recovery time.

---

## 11. Afterwards

- [ ] Watch `sudo tail -f /var/log/nginx/alexandrapintea.access.log` now and
      then for the first day, for 5xx.
- [ ] After a clean week, raise `SECURE_HSTS_SECONDS` to `31536000` in
      `/opt/app/.env`, then
      `docker compose -f docker-compose.prod.yml up -d backend`.

Redeploying a new version, from then on:

```bash
cd /opt/app
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

The entrypoint migrates, creates the cache table and collects static on every
start, so there is nothing else to remember. Watch the logs for thirty seconds
afterwards.

---

## If it goes wrong

There is no going back to Squarespace, so the recovery path is forward: the
containers are the only thing serving the site, and they can be rebuilt from
this repository plus `/opt/app/.env` and a database dump in minutes.

| Symptom | Look at |
| --- | --- |
| 502 from nginx | The container is down: `docker compose -f docker-compose.prod.yml ps`, then `logs backend` |
| 400 on every page | `ALLOWED_HOSTS` — most likely missing `backend` |
| Admin login fails with a CSRF error | `CSRF_TRUSTED_ORIGINS` missing the `https://` scheme |
| Pages render but images 404 | `/opt/app/media` ownership, or the `/media/` location in nginx |
| Admin loads unstyled | `collectstatic` did not run, or `/opt/app/staticfiles` is unreadable |
| Certbot refuses to issue | DNS has not propagated yet, or port 80 is closed in ufw |
