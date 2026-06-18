'use strict';

// ---------------------------------------------------------------------------
// noPulse — request and cookie blocking rules.
//
// Two clean lists drive everything below:
//
//   BLOCK_REQUESTS — fully dropped before they leave the browser.
//   BLOCK_COOKIES  — requests pass, but cookies are denied (response
//                    Set-Cookie stripped, JS-set cookies overridden via
//                    content.js, and any cookie that still slips in is
//                    deleted by the chrome.cookies listener).
//
// To add or remove a rule, edit the relevant array. Nothing else needs to
// change — buildRules() compiles them into declarativeNetRequest rules and
// syncRules() reinstalls them on install, startup, and storage change.
// ---------------------------------------------------------------------------

const BLOCK_REQUESTS = [
  // `domain` matches the host and any subdomain (Adblock-style `||host^`
  // anchor). `path` matches any URL whose path contains the substring.
  //
  // Ad networks / RTB / programmatic
  { kind: 'domain', value: 'appnexus.com' },
  { kind: 'domain', value: 'adnxs.com' },              // AppNexus' actual serving domain (VMAP/VAST for VGTV pre-rolls)
  { kind: 'domain', value: 'adnxs-simple.com' },       // AppNexus video creative CDN (the pre-roll MP4s)
  { kind: 'domain', value: 'adsdk.microsoft.com' },    // Xandr / Microsoft Advertising SDK
  { kind: 'domain', value: 'adsrvr.org' },             // The Trade Desk
  { kind: 'domain', value: 'doubleclick.net' },        // Google ad serving (incl. securepubads.g.*)
  { kind: 'domain', value: 'relevant-digital.com' },   // ad-tech (Schibsted partner)
  { kind: 'domain', value: 'googletagmanager.com' },   // tag loader — its job is to load trackers
  { kind: 'domain', value: 'glimr.io' },               // Nordic ad-targeting / contextual tracking
  { kind: 'domain', value: 'brandmetrics.com' },       // video ad brand-lift measurement

  // Schibsted ad inventory + Pulse SDK + analytics endpoints
  // Note: schibsted.io hosts a lot of FUNCTIONAL APIs too (sportsnext, the
  // VGTV collections API, privacy/CMP). Block only the specific tracker
  // subdomains, not the whole schibsted.io / schibsted.com tree.
  { kind: 'domain', value: 'inventory.schibsted.io' }, // ads.*, cogwheel.*
  { kind: 'domain', value: 'pulse.schibsted.io' },     // Schibsted Pulse (legacy)
  { kind: 'domain', value: 'pulse.m10s.io' },          // Schibsted Pulse (current — m10s = Marketing Services)
  { kind: 'domain', value: 'dc.schibsted.io' },        // Schibsted Data Collector
  { kind: 'domain', value: 'hasher.schibsted.com' },   // identity hashing for ad-tech matching

  // Video player analytics
  // jwpltx.com is JWPlayer's telemetry, NOT the licence/entitlement check
  // (that lives on entitlements.jwplayer.com, which stays allowed). If
  // video ever stops playing, this is the first candidate to drop.
  { kind: 'domain', value: 'jwpltx.com' },

  // Audience measurement
  { kind: 'domain', value: 'log.medietall.no' },

  // First-party-proxied cookie matching — publishers hiding ad-tech behind
  // their own subdomain to evade content blockers.
  { kind: 'domain', value: 'cm.vg.no' },
  { kind: 'domain', value: 'cm.aftenposten.no' },
  { kind: 'domain', value: 'cm.e24.no' },
  { kind: 'domain', value: 'cm.bt.no' },

  // Path fragments (match on any host)
  { kind: 'path', value: '/pulse/' },
  { kind: 'path', value: '/api/pulse' }
];

const BLOCK_COOKIES = {
  // Hosts whose response Set-Cookie headers are stripped entirely while the
  // request itself is allowed through (so functionality keeps working).
  hosts: [
    'sentry.vgnett.no'
  ],
  // Cookie names that must never be set, regardless of host. Matched
  // case-sensitively against the cookie name (the part before `=`).
  names: [
    'spid',
    'SP_ID',
    'vguid',
    'sdrn',
    'pulse',
    '_pulse',
    'pubconsent',
    'euconsent',
    'adn',
    '__mbl',       // medietall audience measurement (seen on all five sites)
    '_gcl_au'      // Google Ads conversion linker (seen on finn.no)
  ]
};

// All resource types declarativeNetRequest knows about. Listing them
// explicitly means our block rules apply to navigations, scripts, images,
// XHR, websockets, beacons — everything.
const ALL_RESOURCE_TYPES = [
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'webtransport',
  'webbundle',
  'other'
];

function buildRules() {
  const rules = [];
  let id = 1;

  for (const r of BLOCK_REQUESTS) {
    const condition = { resourceTypes: ALL_RESOURCE_TYPES };
    if (r.kind === 'domain') {
      // `||example.com^` is the Adblock-style anchor that
      // declarativeNetRequest understands: matches the domain and all its
      // subdomains, at any scheme.
      condition.urlFilter = `||${r.value}^`;
    } else if (r.kind === 'path') {
      condition.urlFilter = r.value;
    } else {
      continue;
    }
    rules.push({
      id: id++,
      priority: 1,
      action: { type: 'block' },
      condition
    });
  }

  for (const host of BLOCK_COOKIES.hosts) {
    rules.push({
      id: id++,
      priority: 1,
      action: {
        type: 'modifyHeaders',
        responseHeaders: [
          { header: 'set-cookie', operation: 'remove' }
        ]
      },
      condition: {
        urlFilter: `||${host}^`,
        requestDomains: [host],
        resourceTypes: ALL_RESOURCE_TYPES
      }
    });
  }

  return rules;
}

async function syncRules() {
  const desired = buildRules();
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  const removeRuleIds = existing.map((r) => r.id);
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds,
    addRules: desired
  });
}

chrome.runtime.onInstalled.addListener(() => {
  syncRules().catch((e) => console.error('[noPulse] rule sync failed', e));
});

chrome.runtime.onStartup.addListener(() => {
  syncRules().catch((e) => console.error('[noPulse] rule sync failed', e));
});

// Belt-and-braces: if any of the blocked cookie names appear in the cookie
// jar (e.g. set by a request that didn't match a response-header rule, or
// by a code path the content script can't reach), remove them as soon as
// they show up.
chrome.cookies.onChanged.addListener(({ removed, cookie }) => {
  if (removed) return;
  if (!BLOCK_COOKIES.names.includes(cookie.name)) return;

  const protocol = cookie.secure ? 'https:' : 'http:';
  const host = cookie.domain.startsWith('.')
    ? cookie.domain.slice(1)
    : cookie.domain;
  const url = `${protocol}//${host}${cookie.path}`;

  chrome.cookies.remove({
    url,
    name: cookie.name,
    storeId: cookie.storeId
  }).catch(() => { /* cookie already gone — ignore */ });
});
