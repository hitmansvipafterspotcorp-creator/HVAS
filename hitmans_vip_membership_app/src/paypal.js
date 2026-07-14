// PayPal Subscriptions — real recurring membership billing to YOUR PayPal.
//
// Set these at build time (see .env.example). Until VITE_PAYPAL_CLIENT_ID and a
// plan id are present, the buy flow keeps its demo button, so nothing breaks.
//
// You create one subscription PLAN per tier in your PayPal account (Products →
// Plans, or the REST API — see PAYPAL_SETUP.md), then paste each plan id below.
const CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || '';

// PayPal.me — the instant path (no setup, real money to your PayPal). On the
// PayPal.me page the buyer can pay with card, Apple Pay, Venmo, or balance.
const PAYPAL_ME = import.meta.env.VITE_PAYPAL_ME || 'hitmanmusicworldwide';
export const paypalMeEnabled = () => !!PAYPAL_ME;
export const paypalMeLink = (usd) => `https://www.paypal.com/paypalme/${PAYPAL_ME}/${usd}USD`;

// tier name -> PayPal plan id (P-XXXXXXXX). Leave blank to keep a tier on demo.
export const PLAN_IDS = {
  Daily: import.meta.env.VITE_PAYPAL_PLAN_DAILY || '',
  Weekly: import.meta.env.VITE_PAYPAL_PLAN_WEEKLY || '',
  Monthly: import.meta.env.VITE_PAYPAL_PLAN_MONTHLY || '',
  Yearly: import.meta.env.VITE_PAYPAL_PLAN_YEARLY || '',
  VIP: import.meta.env.VITE_PAYPAL_PLAN_VIP || '',
};

export const paypalConfigured = () => !!CLIENT_ID;
export const planFor = (tier) => PLAN_IDS[tier] || '';
export const tierPayable = (tier) => paypalConfigured() && !!planFor(tier);

// Load the PayPal JS SDK once (subscription/vault mode). Resolves with window.paypal.
let sdkPromise = null;
export function loadPayPal() {
  if (!paypalConfigured()) return Promise.reject(new Error('paypal not configured'));
  if (typeof window !== 'undefined' && window.paypal) return Promise.resolve(window.paypal);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&vault=true&intent=subscription`;
    s.onload = () => (window.paypal ? resolve(window.paypal) : reject(new Error('paypal sdk failed')));
    s.onerror = () => reject(new Error('paypal sdk blocked'));
    document.head.appendChild(s);
  });
  return sdkPromise;
}
