# noPulse

A small Chrome extension that strips tracking and advertising requests from a
handful of Norwegian news sites while leaving the rest of the page — articles,
video, images, layout — untouched.

## What it does

The extension covers these sites and any of their subdomains:

- `vg.no`
- `aftenposten.no`
- `e24.no`
- `finn.no`
- `bergens-tidende.no`

It applies three layers of filtering:

1. **Requests blocked outright.** Connections to known ad networks and
   analytics pulse endpoints are dropped before they leave the browser.
2. **Cookies denied.** A specific error-logging host is allowed to receive
   its requests so error monitoring keeps working, but the `Set-Cookie`
   response headers are stripped so it cannot identify the user across
   sessions. A short list of tracking cookie names (`spid`, `SP_ID`,
   `vguid`, `sdrn`, `pulse`, `_pulse`, `pubconsent`, `euconsent`, `adn`) is
   blocked everywhere — in response headers, in JavaScript, and as a safety
   net via the cookies API.
3. **Functional hosts left alone.** CDNs, video players, and static asset
   hosts (`*.akamaized.net`, `*.jwpcdn.com`, `*.gstatic.com`) are
   explicitly not touched, so video, images, and fonts keep loading.

## Why

These sites are perfectly readable without their telemetry stack. The point
is to keep the journalism and lose the user profiling — not to break the
page. Each rule is therefore as narrow as possible: a request is only
blocked if it is unambiguously advertising or tracking, and cookies are
only denied when keeping them would defeat the purpose.

## File layout

```
noPulse/
├── manifest.json   Manifest V3 declaration
├── background.js   service worker; declares blocking + cookie rules
├── content.js      document.cookie override, runs at document_start
├── logo.svg        project logo
└── README.md
```

Two arrays in `background.js` drive everything:

- `BLOCK_REQUESTS` — domains, hosts, and URL-path fragments to drop.
- `BLOCK_COOKIES`  — hosts whose response cookies are stripped, plus
  cookie names denied everywhere.

To add or remove a rule, edit the array. The service worker reinstalls the
rules on every install and startup.

## A note on Manifest V3

Under Manifest V3, the `webRequest` API is observation-only for non-policy
extensions; blocking requests requires `declarativeNetRequest`. That is
what `background.js` uses, with the rule set built dynamically from the
arrays described above so the maintenance model stays unchanged: one list,
one source of truth.

JavaScript-set cookies cannot be intercepted through
`declarativeNetRequest`, so `content.js` is injected at `document_start`
in the page's main world and replaces the `document.cookie` setter for the
blocked names.

## Install (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the `noPulse` folder.
4. Reload any open tabs on the covered sites.

Requires Chrome 111 or newer (for main-world content scripts).

## Verifying it works

Open DevTools on, say, `vg.no` and watch the Network tab while reloading.
You should see requests to the blocked domains marked as failed with
`net::ERR_BLOCKED_BY_CLIENT`, and the cookies listed under Application →
Cookies should not contain any of the names in the block list.
