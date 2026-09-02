# PocketPage

A field sales tool. You build a real, live mobile page for a local business
while standing in front of them, hand them your phone, and collect payment
before you walk out.

One file, no build step, no server, no database, no accounts, no monthly cost.

---

## The idea

Small local businesses — barbers, food trucks, detailers, lawn crews, nail
techs — mostly run off Instagram DMs and a phone number. They lose bookings
because there's nowhere to send someone who asks "what do you charge and when
are you open?"

PocketPage answers that in ten minutes for $59 cash.

The trick that makes it sell is that **you build it in front of them**. Nobody
says no to a finished thing with their own name on it that they just watched
get made.

## How the link works

The delivered page has no hosting because there is nothing to host. The entire
page — name, prices, hours, quotes, colors — is gzipped, base64'd, and packed
into the URL fragment after `#p=`. Opening that link unpacks it and rebuilds
the page locally in the browser.

Consequences worth knowing:

- The link works forever and costs nothing to keep alive.
- It works on any phone, no app, no login.
- Nothing is uploaded anywhere. There is no server to see the data.
- The link is long (usually 600–900 characters). It sends fine over SMS,
  WhatsApp, or Instagram DM. **It must be pasted whole** — a truncated link
  can't rebuild itself, and says so plainly instead of showing a broken page.
- Photos are linked by URL, not embedded, so the link stays short.

`Download file` exports the same page as a standalone `index.html` for a real
domain later. That's the $19/month upgrade, not the thing you sell on day one.

## Cold drafts, and the rules that keep them honest

Walking storefronts caps you at roughly ten conversations a day. The **Blast**
tab removes that cap: pick a trade, type a business name and phone number off a
truck door or a Facebook post, and you have a live page in about thirty
seconds. Forty of those from a library bench outruns ten doors.

Building a page for a business that never asked for one is only defensible if
the page says exactly what it is, so three rules are enforced in code rather
than left to the seller:

1. **Every draft carries a claim banner** naming who made it, stating that
   nobody at the business confirmed it, and offering a Call and Text button
   back to the maker. `d.unclaimed` drives it; the Blast tab always sets it.
2. **Drafts publish nothing to search engines.** `LocalBusiness` JSON-LD is
   emitted only for claimed pages, and a draft sets `noindex`. Guessed prices
   never enter the record as fact.
3. **Testimonials are never seeded.** Trade templates fill in services, prices,
   hours and a tagline — never a customer quote. Inventing a review for a real
   business is fabrication, so the quote fields stay empty until a human types
   something a customer actually said.

The corrections are the point. "Those aren't my prices" is a live customer who
started the conversation for you.

## Following up

Blasted drafts log themselves as leads with the generated link attached. Any
lead still at Lead or Demoed after two days surfaces in **Chase these today**
in the Money tab, with the follow-up message pre-written and the original link
already in it — no rebuilding. Acting on a lead resets its clock.

## Running it

It is one static file. Any of these work:

**On a phone, right now** — open the file from anywhere it's hosted and use
*Add to Home Screen*. It then opens like an app and works with no signal.

**GitHub Pages** — this repo already publishes from the `gh-pages` branch. Copy
`pocketpage/index.html` there and it's live at
`https://<user>.github.io/hvas/pocketpage/`.

**Netlify Drop** — go to app.netlify.com/drop, drop the file in, get a public
URL in about thirty seconds. No account needed to start.

**Locally** — `npx http-server -p 8099` then open
`http://127.0.0.1:8099/pocketpage/`.

The builder needs to be at a public URL for the *client's* link to open on the
client's phone, since the link is built from wherever the builder is served.

## What's inside

| Tab | What it does |
| --- | --- |
| **Build** | The full form. Live preview of the exact page they'll get. Copy link, QR code, download, copy HTML. |
| **Blast** | Twelve trade templates. Name + number + trade = a live draft and a written outreach message in ~30 seconds, logged as a lead automatically. |
| **Pitch** | The 30-second script, the price sheet, six objections with answers, where in Tallahassee to walk, and how to raise prices after week one. |
| **Money** | Bill amount and due date, progress against it, the follow-up queue, and a lead list with Lead → Demoed → Sold → Paid. Only Paid counts, because only paid is real. |

Drafts, leads, and the goal are kept in `localStorage` on the device. Nothing
leaves the phone. Clearing browser data clears them, so the leads list is a
working tool, not an archive.

## Notes on the generated page

- Live **Open now / Closed right now** badge computed from the hours, with
  today's row bolded.
- Sticky bottom bar: text-to-book, call, directions — all real `tel:`, `sms:`
  and Maps links.
- `LocalBusiness` JSON-LD so search engines can read it.
- Cash App and Venmo deep links from the handles.
- Its own light and dark themes, independent of the builder's.
- No external requests except an optional photo URL, so it loads instantly on
  a bad connection.

## Offline

`sw.js` caches the shell, and since the tool is one file and every client page
lives in a URL fragment that never reaches a server, that one cache entry makes
the builder *and every page already handed out* work with no signal. Install it
with Add to Home Screen. Where a service worker can't register (`file://`, the
Claude artifact frame) registration fails silently and nothing else changes.

## Browser support

Links are gzipped via `CompressionStream` where available (Chrome, Edge,
Safari 16.4+, Firefox 113+) and fall back to plain base64 everywhere else —
older browsers just produce a longer link. Everything else is plain ES5-style
JS with no dependencies.
