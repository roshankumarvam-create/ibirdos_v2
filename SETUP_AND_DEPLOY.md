# iBirdOS — Complete Operations & Deployment Guide
# Version 3 | workspace.ibirdos.com
# Every command is copy-paste ready. No assumptions.

---

## PART 1: LOCAL SETUP (Run on your machine)

---

### STEP 1.1 — Prerequisites

Install these before anything else:

```bash
# Check if already installed
docker --version        # need 24+
docker-compose --version # need 2.20+
node --version          # need 20+
git --version

# macOS — install Docker Desktop from https://www.docker.com/products/docker-desktop/
# Ubuntu/Debian:
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 nodejs npm
sudo usermod -aG docker $USER  # then log out and back in
```

---

### STEP 1.2 — Extract and Enter Project

```bash
# If you downloaded the ZIP:
unzip ibirdos-complete-v3.zip
cd ibirdos

# Verify structure
ls
# Should show: backend/  frontend/  database/  docker-compose.yml  .env.example  README.md
```

---

### STEP 1.3 — Create Your .env File

```bash
# Copy the template
cp .env.example .env

# Open and edit
nano .env
# or: code .env (VS Code)
# or: vim .env
```

**Paste this complete .env for local development** (replace only the values marked REQUIRED):

```env
# ── Database ─────────────────────────────────────────────────
DATABASE_URL=postgresql://ibirdos:ibirdos_dev@postgres:5432/ibirdos
DB_PASSWORD=ibirdos_dev

# ── Redis ────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379

# ── Auth (REQUIRED: generate a real secret) ──────────────────
JWT_SECRET=your64characterrandomsecretkeyhere1234567890abcdefghij
JWT_EXPIRES_IN=7d

# ── App URLs (local) ─────────────────────────────────────────
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_APP_URL=http://localhost:3000
PORT=3001

# ── OpenAI (REQUIRED for invoice parsing) ────────────────────
OPENAI_API_KEY=sk-proj-PASTE_YOUR_KEY_HERE

# ── File Storage (use local for now, set up S3 later) ────────
S3_BUCKET=ibirdos-files
S3_REGION=us-east-1
S3_ACCESS_KEY=local_placeholder
S3_SECRET_KEY=local_placeholder
S3_CDN_URL=http://localhost:3001/uploads
# Note: Without real S3 credentials, invoice PDF upload stores locally

# ── Email (use Mailtrap for local testing) ───────────────────
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your_mailtrap_user
SMTP_PASS=your_mailtrap_pass
SMTP_FROM=noreply@ibirdos.com
# Get free account at mailtrap.io to test invite emails

# ── Stripe (use TEST keys for local) ─────────────────────────
STRIPE_SECRET_KEY=sk_test_PASTE_YOUR_TEST_KEY
STRIPE_WEBHOOK_SECRET=whsec_WILL_SET_LATER
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_PASTE_YOUR_TEST_KEY

# ── Logging ──────────────────────────────────────────────────
LOG_LEVEL=info
NODE_ENV=development
```

**Generate a secure JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Copy the output and paste as JWT_SECRET
```

---

### STEP 1.4 — Fix Next.js for standalone output (required for Docker)

```bash
# Add output: 'standalone' to frontend/next.config.js
cat > frontend/next.config.js << 'EOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    domains: ['ibirdos-files.s3.amazonaws.com', 'pub-*.r2.dev', 'localhost'],
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  }
};
module.exports = nextConfig;
EOF
```

---

### STEP 1.5 — Create Logs Directory

```bash
mkdir -p logs
```

---

### STEP 1.6 — Start Everything with Docker

```bash
# Build and start all services (first run takes 3-5 min for builds)
docker-compose up -d --build

# Watch logs while it starts
docker-compose logs -f

# Wait until you see:
# backend_1  | iBirdOS backend running on port 3001
# frontend_1 | Ready on http://0.0.0.0:3000
# Press Ctrl+C to stop watching logs (services keep running)
```

**Check all services are running:**
```bash
docker-compose ps
# Should show 5 services: postgres, redis, backend, worker, frontend
# All STATUS should be "Up" or "Up (healthy)"
```

---

### STEP 1.7 — Load Demo Data

```bash
# Wait until postgres shows "healthy" then run:
docker-compose exec postgres psql -U ibirdos -d ibirdos -f /dev/stdin < database/seeds/001_demo.sql

# You should see at the end:
# status
# -----------------------------------------------
# Seed complete. Login: owner@ibirdchef.com / password123

# If that fails (file path issue), use this alternative:
docker cp database/seeds/001_demo.sql ibirdos-postgres-1:/tmp/seed.sql
docker-compose exec postgres psql -U ibirdos -d ibirdos -f /tmp/seed.sql
```

---

### STEP 1.8 — Verify Everything Works

**Test backend health:**
```bash
curl http://localhost:3001/health
# Expected: {"status":"ok","version":"1.0.0","timestamp":"..."}
```

**Test auth:**
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@ibirdchef.com","password":"password123"}'
# Expected: {"token":"eyJ...","user":{"role":"unit_manager",...}}
```

**Test recipes (with token from above):**
```bash
TOKEN="paste_token_here"
curl http://localhost:3001/api/recipes \
  -H "Authorization: Bearer $TOKEN"
# Expected: JSON array with Chicken Biryani, Paneer Tikka, Dal Makhani
```

**Open in browser:**
```
http://localhost:3000          → redirects to login
http://localhost:3000/auth/login → login page
```

**Login and test each role:**
| Email | Password | Expected landing |
|-------|----------|-----------------|
| owner@ibirdchef.com | password123 | /dashboard (full P&L) |
| manager@ibirdchef.com | password123 | /dashboard (no costs) |
| chef@ibirdchef.com | password123 | /kitchen (prep list only) |
| client@example.com | password123 | /restaurant/ibirdchef/menu |

**Test customer menu (no login needed):**
```
http://localhost:3000/restaurant/ibirdchef/menu
```

---

### STEP 1.9 — Stop and Restart

```bash
# Stop all services (data preserved)
docker-compose down

# Start again (no rebuild needed)
docker-compose up -d

# Full reset (DELETES ALL DATA including database)
docker-compose down -v
docker-compose up -d --build
```

---

## PART 2: ENVIRONMENT VARIABLES — FULL REFERENCE

---

### Required for Local (minimum to run)
```
DB_PASSWORD          Any string, used by Postgres
JWT_SECRET           Run: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
OPENAI_API_KEY       From platform.openai.com → API Keys
```

### Required for Production (all must be set)
```
DB_PASSWORD          Strong random string (20+ chars)
JWT_SECRET           64+ random hex characters
OPENAI_API_KEY       From platform.openai.com
S3_ACCESS_KEY        From Cloudflare R2 or AWS
S3_SECRET_KEY        From Cloudflare R2 or AWS
S3_BUCKET            Your bucket name
S3_ENDPOINT          For R2: https://<ACCOUNT_ID>.r2.cloudflarestorage.com
SMTP_HOST            Your email provider (see below)
SMTP_USER            Email account username
SMTP_PASS            App password (NOT your login password)
STRIPE_SECRET_KEY    From Stripe Dashboard → Developers → API Keys
STRIPE_WEBHOOK_SECRET Set after webhook setup (Part 4)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY From Stripe Dashboard
FRONTEND_URL         https://workspace.ibirdos.com
NEXT_PUBLIC_API_URL  https://api.ibirdos.com/api (or backend URL)
```

### Email Setup Options
```bash
# Option A: Gmail App Password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx  # 16-char App Password from Google
# Get at: Google Account → Security → 2-Step Verification → App passwords

# Option B: Resend.com (recommended for production - free 3000/mo)
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx  # API key from resend.com
```

---

## PART 3: PRODUCTION DEPLOYMENT (Railway — Recommended)

Railway gives you: managed PostgreSQL, Redis, auto-deploy from GitHub, SSL, custom domains. Free tier enough to start.

---

### STEP 3.1 — Create Railway Account

1. Go to https://railway.app
2. Sign up with GitHub
3. Click "New Project"

---

### STEP 3.2 — Push Code to GitHub (if not already)

```bash
cd ibirdos
git init
git add .
git commit -m "Initial iBirdOS production deploy"

# Create repo at github.com (click + → New repository → ibirdos → Create)
git remote add origin https://github.com/YOUR_USERNAME/ibirdos.git
git branch -M main
git push -u origin main
```

---

### STEP 3.3 — Set Up PostgreSQL on Railway

1. In Railway project → **Add Service** → **Database** → **PostgreSQL**
2. Click the PostgreSQL service → **Variables** tab
3. Copy the `DATABASE_URL` value (starts with `postgresql://`)
4. Save it — you'll need it for the backend service

---

### STEP 3.4 — Set Up Redis on Railway

1. **Add Service** → **Database** → **Redis**
2. Click Redis → **Variables** → copy `REDIS_URL`

---

### STEP 3.5 — Run Database Migrations

```bash
# Connect to Railway PostgreSQL from your local machine
# First install Railway CLI:
npm install -g @railway/cli
railway login

# Link to your project
railway link

# Run migrations against Railway DB
railway run psql $DATABASE_URL -f database/migrations/001_schema.sql
railway run psql $DATABASE_URL -f database/migrations/002_audit_gaps.sql

# Load demo seed (optional for production)
railway run psql $DATABASE_URL -f database/seeds/001_demo.sql
```

---

### STEP 3.6 — Deploy Backend to Railway

1. **Add Service** → **GitHub Repo** → select your `ibirdos` repo
2. When prompted for root directory: type `backend`
3. Railway will detect Node.js automatically

**Set environment variables** (click backend service → Variables):
```
DATABASE_URL         (paste from Step 3.3)
REDIS_URL            (paste from Step 3.4)
JWT_SECRET           (your 64-char random string)
OPENAI_API_KEY       sk-proj-...
S3_BUCKET            ibirdos-files
S3_REGION            auto
S3_ENDPOINT          https://ACCOUNT_ID.r2.cloudflarestorage.com
S3_ACCESS_KEY        (from Cloudflare R2)
S3_SECRET_KEY        (from Cloudflare R2)
S3_CDN_URL           https://pub-HASH.r2.dev
SMTP_HOST            smtp.resend.com
SMTP_PORT            465
SMTP_USER            resend
SMTP_PASS            re_...
SMTP_FROM            noreply@ibirdos.com
STRIPE_SECRET_KEY    sk_live_...
STRIPE_WEBHOOK_SECRET  (set after Step 4.3)
FRONTEND_URL         https://workspace.ibirdos.com
NODE_ENV             production
PORT                 3001
LOG_LEVEL            info
JWT_EXPIRES_IN       7d
```

4. Click **Deploy**
5. After deploy completes, click **Settings** → **Networking** → **Generate Domain**
6. Note the Railway domain: `ibirdos-backend-production.up.railway.app`

---

### STEP 3.7 — Deploy Worker to Railway

1. **Add Service** → **GitHub Repo** → same repo → root directory: `backend`
2. Go to **Settings** → **Start Command** → change to:
   ```
   node src/workers/queue.js
   ```
3. Add same environment variables as backend (copy-paste)
4. Deploy

---

### STEP 3.8 — Deploy Frontend to Railway

1. **Add Service** → **GitHub Repo** → same repo → root directory: `frontend`
2. **Variables** tab — add:
```
NEXT_PUBLIC_API_URL      https://ibirdos-backend-production.up.railway.app/api
NEXT_PUBLIC_APP_URL      https://workspace.ibirdos.com
NODE_ENV                 production
```
3. Deploy

---

### STEP 3.9 — Set Up Custom Domain (workspace.ibirdos.com)

**In Railway (Frontend service):**
1. Settings → Networking → **Custom Domain**
2. Type: `workspace.ibirdos.com`
3. Railway shows you a CNAME record to add

**In your DNS provider (Cloudflare, GoDaddy, Namecheap, etc.):**
```
Type: CNAME
Name: workspace
Value: (the Railway CNAME value shown, e.g. ibirdos-frontend.up.railway.app)
TTL: Auto
Proxy: OFF (grey cloud if using Cloudflare — must be DNS only)
```

**Wait 5-60 minutes** for DNS to propagate, then:
```bash
curl https://workspace.ibirdos.com
# Should return HTML — no SSL errors
```

Railway automatically provisions SSL via Let's Encrypt. No action needed.

**For API subdomain (optional but cleaner):**
```
Type: CNAME
Name: api
Value: (Railway backend service domain)
```

Then update `NEXT_PUBLIC_API_URL=https://api.ibirdos.com/api`

---

### STEP 3.10 — Alternative: VPS Deployment (DigitalOcean / Hetzner)

Use this if you want full control or lower cost.

**Create VPS:**
- DigitalOcean Droplet: $12/mo (2GB RAM, Ubuntu 22.04)
- Or Hetzner CX21: €4.55/mo (same specs, cheaper)

```bash
# SSH into your VPS
ssh root@YOUR_VPS_IP

# Install Docker
curl -fsSL https://get.docker.com | sh
apt-get install -y docker-compose-plugin

# Clone your project
git clone https://github.com/YOUR_USERNAME/ibirdos.git
cd ibirdos

# Create .env with PRODUCTION values
cp .env.example .env
nano .env  # Fill in all values, use production URLs

# Start services
docker-compose up -d --build

# Run migrations
docker-compose exec postgres psql -U ibirdos -d ibirdos -f /docker-entrypoint-initdb.d/001_schema.sql
# Note: migrations auto-run on first start via docker-entrypoint-initdb.d

# Set up Nginx as reverse proxy
apt-get install -y nginx certbot python3-certbot-nginx
```

**Nginx config:**
```bash
cat > /etc/nginx/sites-available/ibirdos << 'EOF'
server {
    server_name workspace.ibirdos.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
server {
    server_name api.ibirdos.com;
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        client_max_body_size 20M;
    }
}
EOF
ln -s /etc/nginx/sites-available/ibirdos /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Get SSL certificates
certbot --nginx -d workspace.ibirdos.com -d api.ibirdos.com
# Follow prompts, enter email, agree to terms
```

**DNS for VPS:**
```
Type: A
Name: workspace
Value: YOUR_VPS_IP_ADDRESS

Type: A
Name: api
Value: YOUR_VPS_IP_ADDRESS
```

---

## PART 4: DATABASE SETUP & BACKUPS

---

### STEP 4.1 — Verify Database is Persistent

```bash
# The docker-compose.yml already has persistent volumes:
# postgres_data:/var/lib/postgresql/data
# Data survives docker-compose down/up

# Verify volume exists
docker volume ls | grep postgres_data
# Should show: ibirdos_postgres_data
```

### STEP 4.2 — Manual Database Backup

```bash
# Create a backup
docker-compose exec postgres pg_dump -U ibirdos ibirdos > backup_$(date +%Y%m%d_%H%M%S).sql

# Restore from backup
docker-compose exec -T postgres psql -U ibirdos ibirdos < backup_20240115_120000.sql
```

### STEP 4.3 — Automated Daily Backups (VPS)

```bash
# Create backup script
cat > /home/ubuntu/backup_ibirdos.sh << 'EOF'
#!/bin/bash
cd /root/ibirdos
BACKUP_DIR="/root/backups"
mkdir -p $BACKUP_DIR
FILENAME="ibirdos_$(date +%Y%m%d_%H%M%S).sql"
docker-compose exec -T postgres pg_dump -U ibirdos ibirdos > "$BACKUP_DIR/$FILENAME"
gzip "$BACKUP_DIR/$FILENAME"
# Keep only last 30 backups
ls -t $BACKUP_DIR/*.sql.gz | tail -n +31 | xargs rm -f 2>/dev/null
echo "Backup complete: $FILENAME.gz"
EOF
chmod +x /home/ubuntu/backup_ibirdos.sh

# Add to cron (runs at 2 AM every day)
crontab -e
# Add this line:
0 2 * * * /home/ubuntu/backup_ibirdos.sh >> /var/log/ibirdos_backup.log 2>&1
```

### STEP 4.4 — Railway Postgres Backup

Railway has built-in backups on paid plans. For free:
```bash
# Run locally, connecting to Railway DB
pg_dump $(railway run echo $DATABASE_URL) > backup.sql
```

---

## PART 5: STRIPE SETUP (Step-by-Step)

---

### STEP 5.1 — Get Stripe API Keys

1. Go to https://dashboard.stripe.com
2. Create account if needed
3. **Make sure you're in TEST mode** (toggle top-left) for development
4. Go to **Developers** → **API Keys**
5. Copy:
   - **Publishable key**: `pk_test_51...` → put in `.env` as `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key**: `sk_test_51...` → put in `.env` as `STRIPE_SECRET_KEY`

---

### STEP 5.2 — Set Up Stripe Products (Subscription Plans)

Your 17 products are already defined in the code using lookup keys. Create them in Stripe:

```bash
# Install Stripe CLI
# macOS:
brew install stripe/stripe-cli/stripe

# Ubuntu:
curl -s https://packages.stripe.dev/api/security/keypkg/stripe-cli-gpg-pubkey.asc | gpg --dearmor | sudo tee /usr/share/keyrings/stripe.gpg > /dev/null
echo "deb [signed-by=/usr/share/keyrings/stripe.gpg] https://packages.stripe.dev/stripe-cli-debian-local stable main" | sudo tee /etc/apt/sources.list.d/stripe.list
sudo apt update && sudo apt install stripe

# Login
stripe login
```

**Create all subscription products:**
```bash
# Solo Chef - Monthly
stripe prices create \
  --product-data[name]="iBirdOS Solo Chef" \
  --unit-amount=9900 \
  --currency=usd \
  --recurring[interval]=month \
  --lookup-key=solo_plan_monthly

# Solo Chef - Annual
stripe prices create \
  --product-data[name]="iBirdOS Solo Chef" \
  --unit-amount=106900 \
  --currency=usd \
  --recurring[interval]=year \
  --lookup-key=solo_plan_annual

# Core Restaurant - Monthly
stripe prices create \
  --product-data[name]="iBirdOS Core Restaurant" \
  --unit-amount=34900 \
  --currency=usd \
  --recurring[interval]=month \
  --lookup-key=core_restaurant_monthly

# Core Restaurant - Annual
stripe prices create \
  --product-data[name]="iBirdOS Core Restaurant" \
  --unit-amount=376900 \
  --currency=usd \
  --recurring[interval]=year \
  --lookup-key=core_restaurant_annual

# Extra Staff Seat
stripe prices create \
  --product-data[name]="iBirdOS Extra Staff Seat" \
  --unit-amount=1500 \
  --currency=usd \
  --recurring[interval]=month \
  --lookup-key=extra_staff_seat
```

---

### STEP 5.3 — Set Up Stripe Webhook (LOCAL)

```bash
# Terminal 1: Keep your backend running
docker-compose up -d

# Terminal 2: Forward Stripe events to local backend
stripe listen --forward-to localhost:3001/api/quotations/stripe-webhook

# You'll see:
# > Ready! Your webhook signing secret is whsec_xxxxxxxxxxxxxxxx
# COPY THIS VALUE → put in .env as STRIPE_WEBHOOK_SECRET

# Restart backend to pick up new env var
docker-compose restart backend
```

---

### STEP 5.4 — Set Up Stripe Webhook (PRODUCTION)

1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Click **Add endpoint**
3. **Endpoint URL**: `https://api.ibirdos.com/api/quotations/stripe-webhook`
   (or your Railway backend URL: `https://ibirdos-backend.up.railway.app/api/quotations/stripe-webhook`)
4. **Events to listen for** — select:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Click on the webhook → **Signing secret** → **Reveal** → copy
7. Add to production `.env`: `STRIPE_WEBHOOK_SECRET=whsec_...`
8. Redeploy backend

---

### STEP 5.5 — Test Stripe Payment Flow

```bash
# Test card numbers (all work in TEST mode)
# Success:          4242 4242 4242 4242  any future date  any CVV
# Decline:          4000 0000 0000 0002
# Requires 3D auth: 4000 0025 0000 3155
```

**Test the full quotation → deposit flow:**
1. Login as owner → Quotations → New quotation
2. Add menu items → Create
3. Click "Send to client" → copy the client link
4. Open link in incognito window
5. Click "Approve" → then "Pay deposit"
6. Use test card: `4242 4242 4242 4242`, any date/CVV
7. Should redirect back with "Booking confirmed!"
8. Check Stripe Dashboard → Payments → should show the payment

---

## PART 6: INVOICE EXTRACTION SETUP

---

### STEP 6.1 — OpenAI Vision (Already Configured)

The system uses GPT-4o Vision by default. Just add your API key:

```bash
# In .env:
OPENAI_API_KEY=sk-proj-YOURKEY

# Test it works:
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
# Should return JSON with model list
```

**Cost estimate:** 1 invoice parse = ~$0.02-0.05 with GPT-4o Vision.

---

### STEP 6.2 — Test Invoice Extraction End-to-End

```bash
# 1. Login as owner and get token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@ibirdchef.com","password":"password123"}' \
  | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).token)")

echo "Token: $TOKEN"

# 2. Upload a Sysco PDF invoice
curl -X POST http://localhost:3001/api/invoices/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@/path/to/your/sysco_invoice.pdf" \
  -F "supplier=Sysco"

# Expected response:
# {"message":"Invoice uploaded. Parsing in background.","invoice_id":"uuid...","status":"pending"}

# 3. Check parse status (replace INVOICE_ID)
curl http://localhost:3001/api/invoices/INVOICE_ID \
  -H "Authorization: Bearer $TOKEN"

# Check parse_status: "pending" → "processing" → "done"
# Done will show items array with extracted line items

# 4. Watch worker logs in real-time
docker-compose logs -f worker
# You'll see: "Processing invoice uuid..." and "Invoice parsed: 23 items, 87% confidence"
```

---

### STEP 6.3 — AWS Textract (Alternative — Better for Handwritten/Scanned)

If OpenAI OCR isn't accurate enough for your invoices:

```bash
# In .env add:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
USE_TEXTRACT=true
```

Then in `backend/src/services/ocr.js`, the Textract path is already scaffolded — it will activate when `USE_TEXTRACT=true`.

**AWS Textract pricing:** $1.50 per 1,000 pages (first 1,000 pages/month free).

---

## PART 7: COMMON ERRORS & FIXES

---

### ERROR: "Cannot connect to Docker daemon"
```bash
# Start Docker Desktop (Mac/Windows)
# or on Linux:
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker $USER
# Log out and back in, then retry
```

---

### ERROR: Port 3000 or 3001 already in use
```bash
# Find what's using the port
lsof -i :3000
lsof -i :3001

# Kill it (replace PID with the number shown)
kill -9 PID

# Or change the port in docker-compose.yml:
# "3000:3000" → "3010:3000"
# Then access at localhost:3010
```

---

### ERROR: "database connection refused" or "ECONNREFUSED"
```bash
# Check postgres is healthy
docker-compose ps postgres
# If not healthy, check logs:
docker-compose logs postgres

# Common fix: postgres still starting, wait 30s then:
docker-compose restart backend worker

# If DATABASE_URL is wrong, check it:
docker-compose exec backend env | grep DATABASE_URL
# Should show: postgresql://ibirdos:ibirdos_dev@postgres:5432/ibirdos
# NOT localhost — inside Docker, use "postgres" as host

# For LOCAL dev (outside Docker), use:
DATABASE_URL=postgresql://ibirdos:ibirdos_dev@localhost:5432/ibirdos
```

---

### ERROR: "relation does not exist" (table not found)
```bash
# Migrations didn't run. Run them manually:
docker-compose exec postgres psql -U ibirdos -d ibirdos \
  -f /docker-entrypoint-initdb.d/001_schema.sql

docker-compose exec postgres psql -U ibirdos -d ibirdos \
  -f /docker-entrypoint-initdb.d/002_audit_gaps.sql

# Verify tables exist:
docker-compose exec postgres psql -U ibirdos -d ibirdos -c "\dt"
# Should list 20+ tables
```

---

### ERROR: "invalid signature" or JWT errors
```bash
# JWT_SECRET must be identical in .env for all services
# Check it:
docker-compose exec backend env | grep JWT_SECRET
docker-compose exec worker env | grep JWT_SECRET

# If different, set in .env and restart:
docker-compose restart backend worker
```

---

### ERROR: Frontend shows "Network Error" or can't reach API
```bash
# Problem 1: Wrong NEXT_PUBLIC_API_URL
# Inside Docker, frontend uses internal Docker network:
# NEXT_PUBLIC_API_URL=http://backend:3001/api  (inside Docker)
# NEXT_PUBLIC_API_URL=http://localhost:3001/api (local dev without Docker)

# Problem 2: CORS error
# Check backend CORS setting in src/server.js:
# origin: process.env.FRONTEND_URL
# Make sure FRONTEND_URL matches exactly where frontend is hosted

# Problem 3: Backend crashed
docker-compose logs backend | tail -50
# Look for error messages, fix in code, rebuild:
docker-compose up -d --build backend
```

---

### ERROR: Invoice upload fails / S3 error
```bash
# For local development without S3, the upload will fail at the storage step
# Quick fix: use a mock storage service locally

# Option A: Use MinIO (local S3-compatible)
# Add to docker-compose.yml:
#   minio:
#     image: minio/minio
#     ports: ["9000:9000","9001:9001"]
#     command: server /data --console-address ":9001"
#     environment:
#       MINIO_ROOT_USER: minioadmin
#       MINIO_ROOT_PASSWORD: minioadmin
#     volumes: [minio_data:/data]

# Then set in .env:
S3_ENDPOINT=http://minio:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=ibirdos-files
S3_REGION=us-east-1

# Create bucket in MinIO:
# Open http://localhost:9001 → login minioadmin/minioadmin → Create bucket "ibirdos-files"
```

---

### ERROR: "out of memory" during Docker build
```bash
# Increase Docker memory in Docker Desktop:
# Settings → Resources → Memory → set to at least 4GB

# Or build services one at a time:
docker-compose build backend
docker-compose build frontend
docker-compose up -d
```

---

### ERROR: Next.js build fails in Docker
```bash
# Check frontend build log:
docker-compose logs frontend | grep -i error

# Most common: missing output: 'standalone' in next.config.js
# Fix: ensure frontend/next.config.js has output: 'standalone'
# (Step 1.4 above adds this)

# Then rebuild:
docker-compose up -d --build frontend
```

---

### ERROR: Stripe webhook "No signatures found"
```bash
# The webhook secret in .env must match Stripe Dashboard
# For local: must use stripe listen CLI (Step 5.3)
# For production: must copy exact whsec_ value from Stripe Dashboard

# Test webhook manually:
stripe trigger checkout.session.completed
# Should appear in backend logs as "Stripe webhook received"
```

---

## PART 8: POST-DEPLOYMENT VERIFICATION CHECKLIST

Run through this after each deploy:

```bash
# 1. Health check
curl https://workspace.ibirdos.com
# → Login page loads, no console errors

# 2. API health
curl https://api.ibirdos.com/health
# → {"status":"ok","timestamp":"..."}

# 3. Auth works
curl -X POST https://api.ibirdos.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@ibirdchef.com","password":"password123"}'
# → token returned

# 4. Database has data
# Login → Dashboard → should show 3 recipes with COGS badges

# 5. Alerts working
# Dashboard → Alerts → should show 3 pre-seeded alerts

# 6. Customer menu works (no login)
curl https://workspace.ibirdos.com/restaurant/ibirdchef/menu
# → Menu page with iBirdChef recipes

# 7. Invoice upload (need OpenAI key)
# Dashboard → Invoices → upload any food supplier PDF
# Wait 30s → check parse status

# 8. Stripe test payment
# Dashboard → Quotations → New → Create → Send → open client link → Approve → Pay with 4242...
```

---

## PART 9: UPDATING THE APP

```bash
# After making code changes:

# Option A: Full rebuild
docker-compose up -d --build

# Option B: Rebuild only changed service (faster)
docker-compose up -d --build backend
# or
docker-compose up -d --build frontend

# Option C: For Railway (auto-deploy)
git add . && git commit -m "Update description" && git push
# Railway auto-builds and deploys on every push
```

---

## QUICK REFERENCE CARD

```
LOCAL URLS
  App:     http://localhost:3000
  API:     http://localhost:3001
  PgAdmin: Use TablePlus or DBeaver → localhost:5432 / ibirdos / ibirdos_dev

DEMO LOGINS
  Owner:    owner@ibirdchef.com   / password123
  Manager:  manager@ibirdchef.com / password123
  Staff:    chef@ibirdchef.com    / password123
  Customer: client@example.com    / password123

KEY COMMANDS
  Start:   docker-compose up -d
  Stop:    docker-compose down
  Logs:    docker-compose logs -f [service]
  Reset:   docker-compose down -v && docker-compose up -d --build
  DB:      docker-compose exec postgres psql -U ibirdos ibirdos
  Backup:  docker-compose exec postgres pg_dump -U ibirdos ibirdos > backup.sql

SERVICES
  postgres  → port 5432 (database)
  redis     → port 6379 (job queue)
  backend   → port 3001 (Express API)
  worker    → (BullMQ background jobs)
  frontend  → port 3000 (Next.js)

PRODUCTION TARGETS
  Frontend: https://workspace.ibirdos.com
  API:      https://api.ibirdos.com
  
SUPPORT PATH
  1. Check logs: docker-compose logs [service]
  2. Check .env values match (no extra spaces, no quotes needed)
  3. Check Docker has 4GB+ RAM allocated
  4. Verify ports 3000 and 3001 are free
```
