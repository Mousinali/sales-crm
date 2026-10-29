# Deploying sales-crm to an Ubuntu server

This app runs a custom Node server (`server.ts`) that serves Next.js **and**
a Socket.IO websocket on the same HTTP port — not `next start`. Keep that in
mind: any reverse proxy in front of it must forward websocket upgrades.

## 1. Install prerequisites

```bash
# Node 22+ (matches @types/node in package.json; newer LTS also works)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Postgres
sudo apt-get install -y postgresql

# nginx (reverse proxy)
sudo apt-get install -y nginx
```

## 2. Create the database

```bash
sudo -u postgres psql -c "CREATE USER sales_crm WITH PASSWORD 'CHANGE_ME';"
sudo -u postgres psql -c "CREATE DATABASE sales_crm OWNER sales_crm;"
```

## 3. Get the code onto the server

```bash
sudo mkdir -p /srv/sales-crm && sudo chown $USER:$USER /srv/sales-crm
git clone <your-repo-url> /srv/sales-crm
cd /srv/sales-crm
npm ci
npm run build
```

## 4. Configure environment

```bash
cp .env.example .env.local
```

Edit `/srv/sales-crm/.env.local` — see `.env.example` for the full list, plus
the SMTP vars used by the email-announcement feature:

```
DATABASE_URL=postgresql://sales_crm:CHANGE_ME@localhost:5432/sales_crm
SESSION_COOKIE_NAME=sales_crm_session
SESSION_TTL_HOURS=12
SUPER_ADMIN_EMAIL=admin@yourcompany.com
SUPER_ADMIN_PASSWORD=<strong password>
SUPER_ADMIN_NAME=<Your Name>
PORT=3000
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

## 5. Run migrations and seed the first admin

```bash
npm run migrate
npm run seed:admin
```

## 6. Run it as a service (systemd)

```bash
sudo tee /etc/systemd/system/sales-crm.service <<'EOF'
[Unit]
Description=sales-crm
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/srv/sales-crm
ExecStart=/usr/bin/npm run start
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

sudo chown -R www-data:www-data /srv/sales-crm
sudo systemctl daemon-reload
sudo systemctl enable --now sales-crm
sudo systemctl status sales-crm   # verify it's running
journalctl -u sales-crm -f        # logs
```

## 7. Put nginx in front (with websocket support)

```bash
sudo tee /etc/nginx/sites-available/sales-crm <<'EOF'
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/sales-crm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

`proxy_http_version 1.1` + the `Upgrade`/`Connection` headers are required —
without them the Socket.IO chat/notifications connection will fail.

## 8. HTTPS

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Deploying an update later

```bash
cd /srv/sales-crm
git pull
npm ci
npm run build
npm run migrate
sudo systemctl restart sales-crm
```
