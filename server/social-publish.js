// HVAS — direct publishing to TikTok, Instagram and Facebook.
//
// WHY A SERVER: all three platforms fetch the video from a public URL and sign
// the request with an app secret. A browser can't hold the secret and can't
// satisfy their CORS rules, so publishing has to happen here. The phone uploads
// its clip to our storage, then calls this with the resulting public URL.
//
// TOKENS: obtained once per connected account via oauth.js and stored by
// saveToken()/getToken(). Nothing here ever touches the member's password.

const TIKTOK_API = 'https://open.tiktokapis.com/v2';
const GRAPH = 'https://graph.facebook.com/v21.0';

const j = async (res) => {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── TikTok ────────────────────────────────────────────────────────────────
   Content Posting API, PULL_FROM_URL. Your domain must be verified in the
   TikTok developer portal or the pull is rejected.
   Scope: video.publish (Direct Post). Until the app passes audit, posts land
   as private/self-only — that's TikTok policy, not a bug.                  */
export async function postToTikTok({ token, videoUrl, caption }) {
  const init = await j(await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      post_info: {
        title: caption.slice(0, 2200),
        privacy_level: 'PUBLIC_TO_EVERYONE',   // 'SELF_ONLY' pre-audit
        disable_comment: false,
      },
      source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
    }),
  }));
  const id = init?.data?.publish_id;
  // poll until TikTok has fetched and processed the file
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const s = await j(await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish_id: id }),
    }));
    const st = s?.data?.status;
    if (st === 'PUBLISH_COMPLETE') return { ok: true, id };
    if (st === 'FAILED') throw new Error(`TikTok failed: ${s?.data?.fail_reason}`);
  }
  return { ok: false, id, pending: true };
}

/* ── Instagram Reels ───────────────────────────────────────────────────────
   Requires an Instagram Business/Creator account linked to a Facebook Page,
   and the instagram_content_publish permission (App Review).
   Personal IG accounts cannot be published to by any API.                  */
export async function postToInstagram({ token, igUserId, videoUrl, caption }) {
  const create = await j(await fetch(`${GRAPH}/${igUserId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ media_type: 'REELS', video_url: videoUrl, caption, access_token: token }),
  }));
  // the container must finish processing before it can be published
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const s = await j(await fetch(`${GRAPH}/${create.id}?fields=status_code&access_token=${token}`));
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR') throw new Error('Instagram processing failed');
  }
  const pub = await j(await fetch(`${GRAPH}/${igUserId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: create.id, access_token: token }),
  }));
  return { ok: true, id: pub.id };
}

/* ── Facebook Page Reels ───────────────────────────────────────────────────
   Page access token + pages_manage_posts. Same App Review path as IG.      */
export async function postToFacebook({ token, pageId, videoUrl, caption }) {
  const start = await j(await fetch(`${GRAPH}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload_phase: 'start', access_token: token }),
  }));
  await fetch(`https://rupload.facebook.com/video-upload/v21.0/${start.video_id}`, {
    method: 'POST',
    headers: { Authorization: `OAuth ${token}`, file_url: videoUrl },
  });
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const s = await j(await fetch(`${GRAPH}/${start.video_id}?fields=status&access_token=${token}`));
    if (s?.status?.video_status === 'ready') break;
  }
  await j(await fetch(`${GRAPH}/${pageId}/video_reels`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      upload_phase: 'finish', video_id: start.video_id,
      video_state: 'PUBLISHED', description: caption, access_token: token,
    }),
  }));
  return { ok: true, id: start.video_id };
}

// One call the app can make: fan a clip out to every connected platform.
export async function publishEverywhere({ videoUrl, caption, accounts }) {
  const jobs = [];
  if (accounts.tiktok) jobs.push(['tiktok', postToTikTok({ token: accounts.tiktok.token, videoUrl, caption })]);
  if (accounts.instagram) jobs.push(['instagram', postToInstagram({ token: accounts.instagram.token, igUserId: accounts.instagram.userId, videoUrl, caption })]);
  if (accounts.facebook) jobs.push(['facebook', postToFacebook({ token: accounts.facebook.token, pageId: accounts.facebook.pageId, videoUrl, caption })]);
  const done = await Promise.allSettled(jobs.map(([, p]) => p));
  return Object.fromEntries(jobs.map(([name], i) => [
    name, done[i].status === 'fulfilled' ? done[i].value : { ok: false, error: String(done[i].reason?.message || done[i].reason) },
  ]));
}
