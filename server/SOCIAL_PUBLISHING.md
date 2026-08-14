# HVAS social publishing

Direct posting of Lip Sync Bingo takes to **TikTok**, **Instagram Reels** and
**Facebook Page Reels**.

## Why this exists as a server
All three platforms **fetch the video from a public URL** and sign the request
with an app secret. A browser can't hold a secret and can't satisfy their CORS
rules, so publishing happens here. The phone uploads its clip to storage, then
hands this service the public URL.

Flow: `phone records → upload to R2/S3 → public URL → this service → platform`

## Two models — pick one

**A. Venue account (recommended, ship this first).**
One HVAS TikTok / IG / FB account posts every highlight. One connect, one App
Review, works for every member immediately. Members' takes become the club's
marketing.

**B. Member's own accounts.**
Each member connects their own. Also supported by this code, but: Instagram
**cannot** post to personal accounts — the member must have a Business or
Creator account linked to a Facebook Page. Most won't. Expect low uptake.

## Setup

### TikTok
1. developers.tiktok.com → create app → add **Content Posting API**
2. Scopes: `user.info.basic`, `video.publish`
3. Verify your domain (required for `PULL_FROM_URL`)
4. Submit for audit — until it passes, posts are private/self-only
5. Env: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`

### Instagram + Facebook (one Meta app covers both)
1. developers.facebook.com → create app (Business type)
2. Add **Instagram Graph API** + **Facebook Login**
3. IG account must be Business/Creator **and** linked to a Facebook Page
4. App Review for `instagram_content_publish`, `pages_manage_posts`
5. Env: `META_APP_ID`, `META_APP_SECRET`

### Also required
- `HVAS_PUBLIC_URL` — your https domain (github.io won't do; needs a real domain)
- Public media storage — Cloudflare R2 or S3 with public read

## Endpoints to expose
| Route | Does |
|---|---|
| `GET /api/oauth/tiktok/start` | redirect to `connectUrl.tiktok(state)` |
| `GET /api/oauth/tiktok/callback` | `exchangeTikTok(code)` → save token |
| `GET /api/oauth/meta/start` | redirect to `connectUrl.meta(state)` |
| `GET /api/oauth/meta/callback` | `exchangeMeta(code)` → save IG + FB |
| `POST /api/publish` | `{ videoUrl, caption }` → `publishEverywhere()` |

## Honest timeline
Code: ready. **App Review is the long pole — 1–4 weeks per platform**, and it
can come back with change requests. The share-sheet flow already shipped in the
app keeps working the whole time, so nothing is blocked while you wait.
