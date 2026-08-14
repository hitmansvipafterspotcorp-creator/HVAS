// HVAS — one-time account connect for TikTok / Instagram / Facebook.
//
// The member taps "Connect", approves on the platform's own screen (their
// normal login — we never see credentials), and the platform hands us back a
// token we store against their member id. After that, posting is one tap.
//
// Secrets come from env and must never reach the browser.
const ENV = (k) => process.env[k] || '';
const REDIRECT = (p) => `${ENV('HVAS_PUBLIC_URL')}/api/oauth/${p}/callback`;

export const connectUrl = {
  // scope video.publish = Direct Post; video.upload = post to drafts only
  tiktok: (state) => 'https://www.tiktok.com/v2/auth/authorize/?' + new URLSearchParams({
    client_key: ENV('TIKTOK_CLIENT_KEY'), scope: 'user.info.basic,video.publish',
    response_type: 'code', redirect_uri: REDIRECT('tiktok'), state,
  }),
  // one Meta login covers both IG Reels and FB Page posting
  meta: (state) => 'https://www.facebook.com/v21.0/dialog/oauth?' + new URLSearchParams({
    client_id: ENV('META_APP_ID'), redirect_uri: REDIRECT('meta'), state,
    scope: 'instagram_basic,instagram_content_publish,pages_show_list,pages_manage_posts,pages_read_engagement',
  }),
};

const j = async (r) => { const b = await r.json(); if (!r.ok) throw new Error(JSON.stringify(b).slice(0, 300)); return b; };

export async function exchangeTikTok(code) {
  const t = await j(await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: ENV('TIKTOK_CLIENT_KEY'), client_secret: ENV('TIKTOK_CLIENT_SECRET'),
      code, grant_type: 'authorization_code', redirect_uri: REDIRECT('tiktok'),
    }),
  }));
  return { token: t.access_token, refresh: t.refresh_token, expiresIn: t.expires_in };
}

// Meta: short token -> 60-day token -> the member's IG business account + Page
export async function exchangeMeta(code) {
  const short = await j(await fetch('https://graph.facebook.com/v21.0/oauth/access_token?' + new URLSearchParams({
    client_id: ENV('META_APP_ID'), client_secret: ENV('META_APP_SECRET'),
    redirect_uri: REDIRECT('meta'), code,
  })));
  const long = await j(await fetch('https://graph.facebook.com/v21.0/oauth/access_token?' + new URLSearchParams({
    grant_type: 'fb_exchange_token', client_id: ENV('META_APP_ID'),
    client_secret: ENV('META_APP_SECRET'), fb_exchange_token: short.access_token,
  })));
  const pages = await j(await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${long.access_token}`));
  const page = pages.data?.[0];
  return {
    facebook: page ? { token: page.access_token, pageId: page.id, name: page.name } : null,
    instagram: page?.instagram_business_account
      ? { token: page.access_token, userId: page.instagram_business_account.id } : null,
  };
}

// TikTok tokens expire in ~24h — refresh before publishing.
export async function refreshTikTok(refresh) {
  const t = await j(await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: ENV('TIKTOK_CLIENT_KEY'), client_secret: ENV('TIKTOK_CLIENT_SECRET'),
      grant_type: 'refresh_token', refresh_token: refresh,
    }),
  }));
  return { token: t.access_token, refresh: t.refresh_token, expiresIn: t.expires_in };
}
