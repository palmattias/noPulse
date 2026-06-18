'use strict';

// Injected at document_start in the MAIN world so the override is in place
// before any page script touches document.cookie.
(() => {
  const BLOCKED_NAMES = new Set([
    'spid',
    'SP_ID',
    'vguid',
    'sdrn',
    'pulse',
    '_pulse',
    'pubconsent',
    'euconsent',
    'adn'
  ]);

  const descriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    'cookie'
  );

  // If the descriptor is missing or sealed, something else already replaced
  // it. Leave it alone — the cookies API listener in background.js is the
  // safety net.
  if (!descriptor || !descriptor.configurable) return;

  const originalGet = descriptor.get;
  const originalSet = descriptor.set;

  function parseName(raw) {
    const str = String(raw);
    const eq = str.indexOf('=');
    if (eq === -1) return str.trim();
    return str.slice(0, eq).trim();
  }

  Object.defineProperty(Document.prototype, 'cookie', {
    configurable: true,
    enumerable: true,
    get() {
      return originalGet.call(this);
    },
    set(value) {
      try {
        if (BLOCKED_NAMES.has(parseName(value))) {
          // Silently drop — the page sees the assignment as if it
          // succeeded, but no cookie is written.
          return value;
        }
      } catch (_) {
        // Fall through to the original setter on any parsing failure.
      }
      return originalSet.call(this, value);
    }
  });
})();
