// Getting a six-digit code to the person who asked for it.
//
// Until now /auth/member/start handed the code straight back in its own
// response. That is fine on a laptop in a locked room and indefensible on the
// open internet: it means anybody can sign up as anybody's phone number, and
// the "verification" step verifies nothing but that you can type.
//
// The awkward truth about SMS in the United States is that a venue cannot just
// start sending it. Every carrier requires A2P 10DLC brand and campaign
// registration first, which takes days to weeks and is not something you can
// finish the afternoon before a launch. Email has no such gate. So this ships
// with email as the road that actually opens in time, SMS as the road you walk
// later once registration clears, and the same interface over both.
//
// No dependencies. Every one of these providers is an HTTPS POST with a JSON
// body, and pulling in an SDK to do that would be adding a supply chain to
// avoid writing twenty lines.

/** Providers, in the order they are looked for. First one configured wins. */
const PROVIDERS = ['resend', 'postmark', 'sendgrid', 'mailgun', 'twilio'];

/** Is this contact an email address, or a phone number? */
export function contactKind(contact) {
  const s = String(contact || '').trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'email';
  // Ten digits or more, once the shape a person types is stripped out.
  if (/^[+()\-.\s\d]{7,}$/.test(s) && s.replace(/\D/g, '').length >= 10) return 'phone';
  return 'unknown';
}

/** E.164, which is the only shape every SMS API agrees on. */
export function e164(contact, defaultCountry = '1') {
  const raw = String(contact || '').trim();
  if (raw.startsWith('+')) return `+${raw.replace(/\D/g, '')}`;
  const d = raw.replace(/\D/g, '');
  if (!d) return '';
  if (d.length === 10) return `+${defaultCountry}${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return `+${d}`;
}

/**
 * What is configured, and therefore what this venue can actually do right now.
 * `get` is the venue's setting lookup, so a venue can be configured from its
 * own screen without an environment variable and a restart.
 */
export function deliveryConfig(get = () => '') {
  const v = (k) => String(get(k) || process.env[k.toUpperCase()] || '').trim();
  const cfg = {
    resend: { key: v('resend_api_key'), from: v('mail_from') },
    postmark: { key: v('postmark_token'), from: v('mail_from') },
    sendgrid: { key: v('sendgrid_api_key'), from: v('mail_from') },
    mailgun: { key: v('mailgun_api_key'), domain: v('mailgun_domain'), from: v('mail_from') },
    twilio: { sid: v('twilio_account_sid'), token: v('twilio_auth_token'), from: v('twilio_from') },
  };
  const emailProvider = ['resend', 'postmark', 'sendgrid', 'mailgun']
    .find((p) => cfg[p].key && cfg[p].from && (p !== 'mailgun' || cfg[p].domain)) || null;
  const smsProvider = cfg.twilio.sid && cfg.twilio.token && cfg.twilio.from ? 'twilio' : null;
  return {
    ...cfg,
    emailProvider,
    smsProvider,
    // The venue's own name on the message, so a code does not arrive from a
    // stranger. A code nobody recognises is a code nobody types.
    venueName: v('venue_display_name') || process.env.HVAS_VENUE_NAME || 'HITMANS VIP After Spot',
    // With nothing configured the venue is a laptop in its own room and the
    // code goes back in the response, exactly as it always did. That is the
    // only mode in which the code is ever handed to the caller.
    canSend: !!(emailProvider || smsProvider),
  };
}

/** What a member is about to receive. Plain, short, and it names the venue. */
export function codeMessage(code, venueName) {
  return {
    subject: `${code} is your ${venueName} code`,
    text: `${code} is your code to get into ${venueName}.\n\n`
        + `It expires in 5 minutes. If you did not ask for this, ignore it — `
        + `nobody can use it without your phone.`,
  };
}

// ── The providers ─────────────────────────────────────────────────────────
// Each returns { ok, id } or { ok: false, error }. None of them throws: a
// failed send is an answer the caller has to handle, not an exception that
// takes the sign-up endpoint down with it.

async function post(url, headers, body, fetchImpl) {
  try {
    const r = await fetchImpl(url, { method: 'POST', headers, body });
    const txt = await r.text().catch(() => '');
    if (!r.ok) return { ok: false, error: `${r.status} ${txt.slice(0, 200)}` };
    let id = null;
    try { const j = JSON.parse(txt); id = j.id || j.MessageID || j.sid || j.message_id || null; } catch { /* not json */ }
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e.message || 'network' };
  }
}

const SENDERS = {
  resend: (cfg, to, msg, f) => post('https://api.resend.com/emails',
    { Authorization: `Bearer ${cfg.resend.key}`, 'Content-Type': 'application/json' },
    JSON.stringify({ from: cfg.resend.from, to: [to], subject: msg.subject, text: msg.text }), f),

  postmark: (cfg, to, msg, f) => post('https://api.postmarkapp.com/email',
    { 'X-Postmark-Server-Token': cfg.postmark.key, 'Content-Type': 'application/json', Accept: 'application/json' },
    JSON.stringify({ From: cfg.postmark.from, To: to, Subject: msg.subject, TextBody: msg.text,
                     MessageStream: 'outbound' }), f),

  sendgrid: (cfg, to, msg, f) => post('https://api.sendgrid.com/v3/mail/send',
    { Authorization: `Bearer ${cfg.sendgrid.key}`, 'Content-Type': 'application/json' },
    JSON.stringify({ personalizations: [{ to: [{ email: to }] }], from: { email: cfg.sendgrid.from },
                     subject: msg.subject, content: [{ type: 'text/plain', value: msg.text }] }), f),

  mailgun: (cfg, to, msg, f) => post(`https://api.mailgun.net/v3/${cfg.mailgun.domain}/messages`,
    { Authorization: `Basic ${Buffer.from(`api:${cfg.mailgun.key}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({ from: cfg.mailgun.from, to, subject: msg.subject, text: msg.text }).toString(), f),

  twilio: (cfg, to, msg, f) => post(
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(cfg.twilio.sid)}/Messages.json`,
    { Authorization: `Basic ${Buffer.from(`${cfg.twilio.sid}:${cfg.twilio.token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded' },
    new URLSearchParams({ From: cfg.twilio.from, To: to, Body: msg.text }).toString(), f),
};

/**
 * Send a code to a contact. Picks the road by what the contact IS — an email
 * address cannot be texted and a phone number cannot be emailed — and reports
 * honestly when the venue has no road of that kind configured.
 */
export async function sendCode({ contact, code, cfg, fetchImpl = fetch }) {
  const kind = contactKind(contact);
  const msg = codeMessage(code, cfg.venueName);
  if (kind === 'email') {
    if (!cfg.emailProvider) return { ok: false, error: 'no-email-provider', kind };
    const r = await SENDERS[cfg.emailProvider](cfg, String(contact).trim(), msg, fetchImpl);
    return { ...r, kind, via: cfg.emailProvider };
  }
  if (kind === 'phone') {
    if (!cfg.smsProvider) return { ok: false, error: 'no-sms-provider', kind };
    const r = await SENDERS[cfg.smsProvider](cfg, e164(contact), msg, fetchImpl);
    return { ...r, kind, via: cfg.smsProvider };
  }
  return { ok: false, error: 'unrecognised-contact', kind };
}

/**
 * What a member is told about where their code went. Enough to recognise the
 * inbox it landed in, never enough to read somebody else's contact off a
 * screen they are holding up in a crowded room.
 */
export function maskContact(contact) {
  const s = String(contact || '').trim();
  const at = s.indexOf('@');
  if (at > 0) {
    const user = s.slice(0, at), dom = s.slice(at);
    if (user.length <= 2) return `${user[0]}${'\u2022'}${dom}`;
    return `${user.slice(0, 1)}${'\u2022'.repeat(Math.max(1, user.length - 2))}${user.slice(-1)}${dom}`;
  }
  const d = s.replace(/\D/g, '');
  return d.length >= 4 ? `\u2022\u2022\u2022 \u2022\u2022\u2022 ${d.slice(-4)}` : '\u2022\u2022\u2022';
}

export { PROVIDERS };
