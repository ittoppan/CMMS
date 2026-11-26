# PWA Audit — CMMS-TOPPAN (vs pwa-expert skill)

Date: 2026-11-26
Branch: pwa-align-tokens (worktree)

## Status Summary

CMMS already has a full PWA implementation (SW v255, manifest, PwaRegister, offline infra). This audit checks compliance against `pwa-expert` skill guidelines.

## Checklist

### Installability
- [x] HTTPS (production) / localhost (dev)
- [x] Web App Manifest (`/manifest.webmanifest`) with required fields (name, short_name, start_url, display, icons)
- [x] Service Worker with fetch handler (`/sw.js`)
- [x] Icons 192x192 and 512x512 (any + maskable via icon-512)
- [x] theme-color meta + manifest theme_color (#0068B5 / #FFFFFF viewport)
- [x] appleWebApp capable + apple-touch-icon (metadata + PwaRegister injection)

### Service Worker & Caching
- [x] Registration with scope "/" (PwaRegister, updateViaCache: "none")
- [x] Install: precache shell assets (per-URL, Promise.allSettled)
- [x] Activate: clean old caches + clients.claim()
- [x] Fetch strategies: API network-first + cache fallback; static SWR; navigation network-only (non-offline routes) / network-first (offline routes)
- [x] Skip waiting via SKIP_WAITING message
- [x] Cross-origin requests skipped (CDN, LINE)

### Install Prompts
- [x] beforeinstallprompt handling (lib/install-detect.ts)
- [x] Custom install banner UI (PwaRegister) with dismissed state (localStorage)
- [x] Fallback to /install page when native prompt unavailable
- [x] appinstalled listener

### Offline Experience
- [x] Offline fallback page (offline.html) with brand styling
- [x] ConnectivityStatus component (chip/icon variants)
- [x] Offline queue + sync center (lib/offline/*, offlineQueue.ts, offline-store.ts)
- [x] Offline routes precached (PAGE_CACHE)

### Background Sync
- [x] Sync tags (sync-checkins pattern available)
- [x] IndexedDB helper pattern (lib/db usage)
- [x] Retry logic with max attempts

### Update Flow
- [x] updatefound + statechange detection
- [x] Update banner UI with "Reload Now" / dismiss
- [x] Auto-reload on idle (2 min inactivity) with controllerchange
- [x] Manual update check (registration.update())

### Next.js Integration
- [x] Manual SW registration (required for output: 'export' / static)
- [x] Manifest via metadata (app/manifest not used; metadata.manifest instead)
- [x] PwaRegister in root layout

### Design Token Alignment (this branch)
- [x] PwaRegister banner colors → CSS variables (var(--tp-*))
- [x] apple-touch-icon link injection
- [ ] offline.html fallback → still uses hardcoded hex (standalone HTML, no token runtime) — acceptable, brand blue #0068B5 matches token
- [ ] ConnectivityStatus uses Tailwind semantic classes (border-destructive etc.) — consistent with shadcn theme

## Known Gaps / Recommendations
1. ~~Maskable icon reuses icon-512.png~~ → **RESOLVED** — dedicated maskable icon generated at `frontend/public/icons/icon-maskable-512.png` (`scripts/gen_maskable.py`), manifest updated ✅
2. ~~No periodic background sync~~ → **RESOLVED** — periodic sync added to `frontend/public/sw.js` ✅
3. Push notification VAPID key flow depends on /api/v1/push_subscribe.php (server-side) → **CSRF enforced** in `public/api/v1/push_subscribe.php` ✅
4. ~~Consider adding `content-visibility: auto` for long lists~~ → **RESOLVED** — present in `frontend/app/globals.css` (line 110) ✅
5. Lighthouse PWA audit should be run before production deploy — Lighthouse PWA category unavailable in current Chrome; DevTools installability checks used instead (see PWA_AUDIT.md) — pending final production deploy check

## Files Changed in This Branch
- frontend/components/PwaRegister.tsx (token alignment + apple-touch-icon injection)
- docs/PWA_AUDIT.md (this file)
