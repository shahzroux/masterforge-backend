# MasterForge Backend

Proxy server untuk MasterForge — menyembunyikan OpenRouter API key dari pengguna.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Buat .env file
```bash
cp .env.example .env
```
Edit `.env` dan masukkan API key kau:
```
OPENROUTER_API_KEY=sk-or-v1-xxxxxxxx
FRONTEND_URL=https://your-app.netlify.app
```

### 3. Run locally
```bash
npm run dev
```
Server akan start di `http://localhost:3001`

---

## Deploy ke Railway (percuma)

1. Pergi [railway.app](https://railway.app) → New Project → Deploy from GitHub
2. Upload folder `masterforge-backend` ke GitHub repo baru
3. Railway akan auto-detect Node.js dan deploy
4. Dalam Railway dashboard → Variables, tambah:
   - `OPENROUTER_API_KEY` = API key kau
   - `FRONTEND_URL` = URL Netlify kau
5. Salin URL Railway (contoh: `https://masterforge-backend.up.railway.app`)
6. Paste URL tu dalam MasterForge frontend → "+ Backend URL"

---

## Deploy ke Render (percuma)

1. Pergi [render.com](https://render.com) → New Web Service
2. Connect GitHub repo
3. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Environment Variables → tambah `OPENROUTER_API_KEY` dan `FRONTEND_URL`

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Check server status |
| POST | `/api/analyze` | Proxy ke OpenRouter AI |

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | ✅ | - | API key dari openrouter.ai |
| `FRONTEND_URL` | Recommended | `*` | URL frontend untuk CORS |
| `DEFAULT_MODEL` | ❌ | `openrouter/auto` | Model AI yang digunakan |
| `RATE_LIMIT` | ❌ | `20` | Max request per IP per window |
| `RATE_WINDOW` | ❌ | `3600` | Window size dalam saat |
| `PORT` | ❌ | `3001` | Port server |
