# ShiftCall - Production Deploy Guide

Stack:
- **Frontend** (Vite SPA) -> Vercel
- **Backend** (FastAPI Python) -> Render
- **Auth + DB** -> Supabase (already live)

Total time end-to-end: ~20 minutes.

---

## Prerequisites

1. A GitHub account (the repo lives there; both Render and Vercel pull from it).
2. A Render account: https://render.com  (sign in with GitHub).
3. A Vercel account: https://vercel.com (sign in with GitHub).
4. Your Supabase project already running.

---

## Step 0 - Push to GitHub (one time)

From the repo root:

```bash
git init
git add .
git commit -m "Initial commit"
```

Then on GitHub create an empty repo (no README, no .gitignore - we already have both) named `shiftcall`. Copy the URL it gives you, then:

```bash
git remote add origin https://github.com/YOUR-USERNAME/shiftcall.git
git branch -M main
git push -u origin main
```

Verify on GitHub: open the repo, search for `.env` - **it must not appear**. The `.gitignore` blocks it. If it shows up, stop and fix before going further.

---

## Step 1 - Deploy backend to Render

1. https://render.com -> **New + -> Web Service** -> **Build and deploy from a Git repository** -> pick `shiftcall`.
2. Render reads `render.yaml` and pre-fills everything (root dir = `backend`, build/start commands, free plan).
3. Click **Create Web Service**.
4. While it builds (~3 min), open the **Environment** tab and add these vars:

| Key | Value | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | your Claude key (fallback) | recommended |
| `PINECONE_API_KEY` | your Pinecone key | optional |
| `MISTRAL_API_KEY` | your Mistral key | optional |
| `OPENAI_API_KEY` | your OpenAI key | optional |
| `CORS_ORIGINS` | leave blank for now (will fill after Vercel) | required later |

5. When the build finishes, copy the URL Render assigns you, e.g. `https://shiftcall-api.onrender.com`. Hit it in a browser - you should see `{"status":"ok","message":"ShiftCall AI Intelligence Layer is active"}`.

---

## Step 2 - Wire that URL into the frontend

Open `frontend/vercel.json` locally and replace the placeholder:

```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://shiftcall-api.onrender.com/:path*"
    }
  ]
}
```

Commit + push:

```bash
git add frontend/vercel.json
git commit -m "Wire vercel.json to Render backend URL"
git push
```

---

## Step 3 - Deploy frontend to Vercel

1. https://vercel.com -> **Add New + -> Project** -> import `shiftcall`.
2. Configure:
   - **Root Directory**: `frontend`
   - **Framework Preset**: Vite (auto-detected)
   - **Build Command**: leave default (`npm run build`)
   - **Output Directory**: leave default (`dist`)
3. Expand **Environment Variables** and add:

| Key | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://zhmbtzyeyjpvbcuprhbr.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | (your anon public key) |

4. Click **Deploy**. ~2 min later you get a URL like `https://shiftcall.vercel.app`.

---

## Step 4 - Lock CORS to your Vercel domain

Back to Render -> your service -> **Environment** tab:

- `CORS_ORIGINS` = `https://shiftcall.vercel.app,https://shiftcall-git-main-YOUR-USERNAME.vercel.app`
  (the second one is your preview branch URL - copy both from Vercel's project Domains tab)

Save. Render redeploys automatically (~1 min).

---

## Step 5 - Update Supabase + Google OAuth for the production domain

### Supabase Dashboard
**Authentication -> URL Configuration**
- **Site URL**: `https://shiftcall.vercel.app`
- **Redirect URLs**: add both
  - `https://shiftcall.vercel.app/**`
  - `http://localhost:3001/**`  (so local dev still works)

### Google Cloud Console
Open your OAuth 2.0 Client ID -> **Edit**:
- **Authorized JavaScript origins**: add `https://shiftcall.vercel.app`
- **Authorized redirect URIs**: leave the existing Supabase callback unchanged
  (`https://zhmbtzyeyjpvbcuprhbr.supabase.co/auth/v1/callback`)

### Run the SQL migration (only if you haven't yet)
Supabase -> **SQL Editor** -> New query -> paste contents of `supabase/migrations/001_init.sql` -> Run.

---

## Step 6 - Smoke test

1. Open `https://shiftcall.vercel.app`
2. Click **Continue with Google** -> Google account picker -> back to your app.
3. Onboarding wizard appears. Paste your Vapi public key, Deepgram key, Anthropic key.
4. Land on the dashboard. Click **Live Call**, set up a persona, click **Start Call**.
5. Talk to Aria. Sentiment should stream in real time. Hang up - post-call summary should appear.

If anything breaks, see Troubleshooting below.

---

## Troubleshooting

### "redirect_uri_mismatch" from Google
Google Cloud Console doesn't have your Supabase callback as an authorized redirect URI. Re-check Step 5.

### Login works but dashboard is blank, console shows 401 from Supabase
The SQL migration didn't run. Re-run Step 5's last sub-step.

### Live call works but sentiment streaming is silent
Open DevTools Network tab. If `/api/sentiment-stream` returns 502, the Render backend is cold-starting (free tier sleeps after 15 min). Wait 30 sec, retry. If it returns 403/CORS error, your `CORS_ORIGINS` env var on Render doesn't include the Vercel domain. Fix in Step 4.

### Render free tier sleeps after 15 min idle
This is normal. First request after idle takes ~30s to wake the dyno. For a public demo, upgrade to Render's $7/mo Starter plan (always-on).

### Your Vercel preview URLs change every push
Vercel gives every branch and every commit a unique preview URL. To keep CORS sane, either:
- Use a wildcard pattern in your custom domain config, or
- Add the stable production URL only to `CORS_ORIGINS` and skip preview testing for now.

---

## Rotating secrets

Anything you've shared in chat (Google Client Secret, Supabase keys) should be rotated before public launch:

- **Google OAuth Client Secret**: Google Cloud Console -> your OAuth client -> **Reset Secret** -> paste new value into Supabase.
- **Supabase anon key**: Settings -> API -> "Generate new anon key" -> update everywhere.
- **Anthropic / Vapi / Deepgram keys**: rotate from each provider's dashboard.
