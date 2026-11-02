# Plan: Web, Desktop and Android Builds

**Status:** implemented (web + desktop + Android scaffold + CI); secrets configured
**Scope:** Web/PWA, Desktop (Linux, macOS, Windows), Android
**Out of scope:** iOS (Capacitor `ios/` platform is not generated, no App Store work)
**Android distribution:** ZapStore only (signed APK; no Google Play, no AAB)
**Desktop signing:** unsigned builds in v1
**TUI:** not packaged or shipped; source stays for server/dev use
**Build system:** GitHub Actions
**Date:** 2026-11-02
**Implemented:** 2026-11-03

---

## Implementation status (2026-11-03)

| Area | Status | Evidence |
|---|---|---|
| Build scripts | Done | `build:web`, `build:electron`, `dist:desktop`, `android:sync`, `dist:android` in `package.json` |
| Shared identity key | Done | `src/core/identity-key.ts`; used by `src/browser-index.ts` and `src/electron/main.ts` |
| Native P2P key support | Done | `privateKey` option in `src/core/p2p.ts` |
| Electron shell | Done | `src/electron/main.ts`, `preload.ts`, `bridge-ipc.ts`, `static-server.ts` |
| Electron packaging | Done | `electron-builder.yml`; Linux AppImage, `.deb`, `.rpm` and `.flatpak` built locally; Flatpak installed and `flatpak info` shows runtime 25.08; packaged-asar smoke returns a JID + OMEMO fingerprint |
| Desktop smoke test | Passed | `npx playwright test tests-e2e/electron.spec.ts` — bridge + stable JID across restart + `crypto.subtle` |
| PWA / web build | Done | `npm run build:web`; 26 onboarding/UI e2e tests pass |
| Backend test suite | Passed | `npm test` (all node/XEP verification scripts) |
| Android scaffold | Done | `capacitor.config.ts`, `android/`, `npx cap doctor` reports Android looking great |
| Android signing config | Done | `android/app/build.gradle` reads `android/keystore.properties` |
| ZapStore listing | Done | `zapstore.yaml`, `assets/zapstore-icon.png` |
| Release workflow | Done | `.github/workflows/release.yml`; `actionlint` passes |
| GitHub Actions verification | Passed | run `41525774676`: web + Android signed APK + all three desktop OSes; run `41528275681` after artifact-name fix: Linux AppImage/deb/rpm/flatpak, Windows setup+portable, macOS dmg+zip (x64/arm64) |
| Repository secrets | Done | All five secrets set on `imattau/XMPP_P2P` from `~/.config/nostr-release/signing.env`; keystore password + alias verified with `openssl pkcs12` (cert CN=Scrollstr) |
| ZapStore `pubkey` | Done | `npub1khf5amw8mrupe649a5mhkk3d2d8wjj06urz6kwawpftk4f68tjlstdmd3q` added to `zapstore.yaml` |

The implementation moved the Electron sources under `src/electron/` so the
existing `tsconfig.json` (`rootDir: src`) emits `dist/electron/main.js`
without a second build pipeline.


---

## 1. Objectives

1. Produce versioned artifacts from CI for:
   - **Web**: static `ui/dist` bundle + PWA, deployable to the existing Caddy server.
   - **Desktop**: unsigned Electron installers for Linux (AppImage, deb/apt, rpm, Flatpak), macOS (dmg/zip, x64+arm64), Windows (nsis/portable).
   - **Android**: signed APK for API 24+, published to ZapStore.
2. Keep one web codebase. Desktop and Android are shells around the existing `ui/dist` build.
3. Preserve the native networking advantage on desktop: TCP, mDNS and `node:sqlite` must run in the Electron main process, not in the renderer.
4. Make releases reproducible from a tag (`v*`) with no local Mac/Windows machine required.
5. Do not regress the existing server deployment (`scripts/deploy-remote.sh`). The TUI source remains for server/dev use but is no longer a distribution target.

**Non-goals for this phase:** push notifications, background delivery on Android, auto-update, desktop code signing/notarization, Google Play, TUI packaging, iOS.

---

## 2. Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Electron + electron-builder** for desktop. | Node 22 runtime is already required; `node:sqlite` is a builtin (no native rebuild); existing React UI is reused. Tauri would need a Node sidecar. |
| D2 | **Capacitor 8.x** for Android. | Thin native shell over `ui/dist`; no port of the UI or the browser runtime. Capacitor 9 is beta — stay on 8. |
| D3 | **Desktop runs one native Node peer in the main process**, exposed to the renderer through an IPC bridge. | Avoids a second identity and keeps SQLite/TCP/mDNS. |
| D4 | **Desktop window loads `http://127.0.0.1:<ephemeral>`**, not `file://`. | `file://` is not a secure context, so `crypto.subtle` (OMEMO, recovery phrase) fails. Localhost is a secure context. |
| D5 | **Android uses the existing browser runtime** (`createBrowserXmppNode`, IndexedDB, WebRTC/WS). | No Node on Android; this is the only viable path and it is already written. |
| D6 | **Web stays a static PWA** and keeps the existing relay/server deployment. | No new hosting model. |
| D7 | **iOS is excluded**; do not run `cap add ios`, do not add iOS jobs. | Per current scope. |
| D8 | **Android ships only through ZapStore**, as a signed APK. | User decision; no Play Store account, metadata or AAB needed. |
| D9 | **Reuse the Mangatsu/scrollstr Android keystore and `ZAPSTORE_NSEC`.** | User decision; same publisher identity and already-linked signing certificate. |
| D10 | **Desktop builds are unsigned in v1.** | User decision; avoids Apple Developer/Windows cert work. Gatekeeper/SmartScreen warnings documented. |
| D11 | **The TUI is not packaged.** | User decision; Electron/Android ship the React UI only. |
| D12 | **Fix the Android `applicationId` now.** It is the permanent ZapStore package identity. | Changing it later creates a new app and breaks updates. |

---

## 3. Current state (verified)

- `package.json`
  - `build` = `tsc` → `dist/`.
  - `build:browser` = `esbuild.browser.mjs` → `dist/browser/bundle.js`.
  - `ui:build` = browser bundle + `vite build` → `ui/dist/` (~4.1 MB).
  - Node 22+ (`engines`), ESM (`"type": "module"`).
- `ui/`
  - React 19 + Vite 7 + Tailwind 4, `vite-plugin-pwa` already configured.
  - `ui/index.html` loads `/browser-bundle.js`, fetches `/bootstrap-config.json`, then `src/main.tsx`.
  - `ui/src/bridge/runtime.ts` reads `window.__XMPP_P2P_BRIDGE__`; `Root.tsx` skips client creation when it is already set.
- `src/browser-index.ts`
  - Browser client: key derivation (recovery phrase), IndexedDB storage, browser libp2p, `BrowserXmppRuntimeBridge`.
- `src/core/p2p.ts`
  - Node libp2p: TCP + WS (`port + 1000`), mDNS, DHT, optional relay/WebRTC.
- `src/core/storage/node-sqlite-storage.ts`
  - `node:sqlite` `DatabaseSync`; no native module.
- `scripts/deploy-remote.sh`
  - Builds, installs a Node daemon + Python static UI server, writes `ui/dist/bootstrap-config.json`, configures Caddy/nginx.
- `.github/workflows/ci.yml`
  - Tests + docs on `master`; no release artifacts.

**Key gaps**

- No `electron/`, `capacitor.config.ts`, `android/`, or release workflow.
- Identity key on browser/Android is stored in IndexedDB (can be evicted).
- No PWA build variant that disables the service worker for native shells.
- No background/foreground lifecycle handling.
- No native versioning (`versionCode`/`versionName`) and no ZapStore listing/config.
- No WSS-only validation for user-entered bootstrap addresses.

---

## 4. Target architecture

```
                        ┌─────────────────────────────┐
   Web / PWA  ─────────▶│  ui/dist (static, SW on)    │──┐
                        └─────────────────────────────┘  │  WSS / WebRTC
                                                         ▼
                        ┌─────────────────────────────┐  ┌──────────────────┐
   Android  ───────────▶│  Capacitor WebView          │──│  browser libp2p  │
                        │  https://localhost          │  │  IndexedDB       │
                        └─────────────────────────────┘  └──────────────────┘
                                                         │  WSS / WebRTC
                                                         ▼
                        ┌─────────────────────────────┐  ┌──────────────────┐
   Desktop  ───────────▶│  Electron renderer          │  │  native libp2p   │
                        │  http://127.0.0.1:<port>    │◀─│  TCP/mDNS/DHT    │
                        │  preload → IPC bridge       │  │  node:sqlite     │
                        └─────────────────────────────┘  └──────────────────┘
```

Desktop is the only platform with a native peer. Web and Android remain browser peers and require a relay for full connectivity.

---

## 5. Work breakdown

### Phase 0 — Foundations (2–4 days)

Goal: one reproducible build entry point and an Electron viability spike.

- [ ] **0.1** Add `npm run build:web` = `npm run build:browser && npm --prefix ui run build`; make `ui:build` call it.
- [ ] **0.2** Add `npm run build:electron` = `tsc -p tsconfig.electron.json` → `dist/electron/`, plus a `dist:desktop` / `dist:android` wrapper once the shells exist.
- [ ] **0.3** Add `scripts/sync-version.mjs`:
  - read `package.json` version;
  - write Android `versionName` and monotonic `versionCode` (from `GITHUB_RUN_NUMBER` when present);
  - expose the same version to `zapstore.yaml` checks and the GitHub Release name.
- [ ] **0.4** Spike Electron in a throwaway branch:
  - verify the latest stable Electron ships Node ≥ 22.13 and `require('node:sqlite')` works unflagged in the main process;
  - verify `BrowserXmppRuntimeBridge` can be constructed in the main process (it is window-guarded except `disconnect`, which checks `typeof window`);
  - verify `crypto.subtle` works in a renderer loaded from `http://127.0.0.1`.
  - **If `node:sqlite` is unavailable in Electron**, fall back to `better-sqlite3` + `electron-rebuild` (adds native-module CI work) or JSON-file storage. Record the decision here.
- [ ] **0.5** Extract `keyFromRecoveryPhrase` from `src/browser-index.ts` into a shared module (`src/core/identity-key.ts`) so the native node can derive the same identity.
- [ ] **0.6** Add `privateKey?: PrivateKey` to `createP2PNode()` so the native node can use a recovery-phrase-derived key.
- [ ] **0.7** Choose and record the permanent Android `applicationId` and ZapStore package ID (e.g. `app.nexus.xmpp`). This cannot change after the first ZapStore release.

**Exit criteria:** Electron main can open a window showing the UI, talk to a local libp2p node, and persist to SQLite. No production code merged before the spike passes.

---

### Phase 1 — Web/PWA (1–2 days)

Goal: a first-class release artifact that the other platforms reuse.

- [ ] **1.1** Make the PWA config build-target aware:
  - `vite.config.ts`: disable `injectRegister`/service worker when `VITE_TARGET=capacitor` or `VITE_TARGET=electron`;
  - keep the SW on for `VITE_TARGET=web`.
- [ ] **1.2** Add `ui/public/bootstrap-config.json` handling:
  - web build ships the file as today;
  - support an optional `VITE_BOOTSTRAP_ADDRS` build-time override;
  - document that the relay must be `wss://` with a valid certificate.
- [ ] **1.3** Add a `web` job to CI that uploads `ui-dist` as an artifact.
- [ ] **1.4** Document deployment: `scripts/deploy-remote.sh` remains the supported path because it writes the bootstrap config and enables the Caddy WSS relay.
- [ ] **1.5** Add a PWA smoke check to the existing Playwright run (manifest present, service worker registered on web target only).

**Exit criteria:** `ui-dist` artifact installs as a PWA, connects to a `wss://` relay, and the existing e2e suite is green.

---

### Phase 2 — Desktop (6–10 days)

Goal: Electron installers with a single native identity.

#### 2.1 Electron entry points

New files:

```
electron/
  main.ts            # app lifecycle, native node, static server, IPC dispatcher
  preload.ts         # contextBridge bridge proxy
  bridge-ipc.ts      # method whitelist + event forwarding
  static-server.ts   # tiny http server for ui/dist
electron-builder.yml
```

- [ ] **2.2** `main.ts`:
  - resolve `app.getPath('userData')/state.sqlite`;
  - derive the libp2p key (recovery phrase or generated) and pass it to `createP2PNode`;
  - create `XmppNode` with `NodeSqliteStorage`;
  - start a static server on `127.0.0.1` with an ephemeral port;
  - create `BrowserWindow` with `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`;
  - block `will-navigate`/`setWindowOpenHandler` to external URLs;
  - close the node and server on `window-all-closed` / `before-quit`.
- [ ] **2.3** `static-server.ts`:
  - serve `app.getAppPath()/ui/dist` (works inside asar);
  - SPA fallback to `index.html`;
  - `Content-Security-Policy` allowing `'self'`, `ws:`, `wss:`, `blob:`, `data:` and `'wasm-unsafe-eval'`;
  - correct MIME for `.wasm`, `.js`, `.svg`.
- [ ] **2.4** `preload.ts`:
  - bundle to **CJS** (`dist/electron/preload.cjs`) with esbuild — sandboxed preloads do not support ESM;
  - `contextBridge.exposeInMainWorld('__XMPP_P2P_BRIDGE__', proxy)`;
  - proxy methods over `ipcRenderer.invoke('xmpp:call', method, args)`;
  - convert `File` → `Uint8Array` + name + mime before invoking `uploadFile`;
  - fan out `ipcRenderer.on('xmpp:event:<name>')` to local listeners; return unsubscribe functions.
- [ ] **2.5** `bridge-ipc.ts`:
  - whitelist the `XmppRuntimeBridge` methods from `ui/src/bridge/runtime.ts`;
  - reject unknown methods;
  - construct one `BrowserXmppRuntimeBridge` in main with `stopNetwork = () => libp2p.stop()`;
  - forward all `on*` listener events to `webContents.send`.
- [ ] **2.6** Renderer integration:
  - `Root.tsx` already skips client creation when `getBrowserXmppBridge()` is set — verify the preload runs before React;
  - onboarding `ReadyPage`/`ServerSetupPage` already skip when a bridge exists — verify the recovery-phrase flow does not try to create a browser node;
  - add a small `isNativeShell()` helper if any page needs to hide "browser networking" copy.
- [ ] **2.7** Lifecycle:
  - `powerMonitor` suspend/resume or `app` events → `bridge.disconnect()` / re-init;
  - on resume, let the DHT mailbox flush as it does in the browser.

#### 2.8 Packaging

- [ ] **2.9** `electron-builder.yml`:
  - `appId`, `productName`, `directories.output: release/`;
  - `files`: `dist/**`, `ui/dist/**`, `package.json`, minimal production `node_modules`;
  - `main`: `dist/electron/main.js` (change root `package.json` `main`; `npm start` already points at `dist/index.js` explicitly);
  - targets: `linux: [AppImage, deb, rpm, flatpak]`, `mac: [dmg, zip]`, `win: [nsis, portable]`;
  - `mac.target.arch: [x64, arm64]` or a universal build;
  - `asar: true`; no `asarUnpack` needed;
  - Flatpak: runtime/SDK/base `org.freedesktop.*`/`org.electronjs.Electron2.BaseApp` `25.08`, `branch: stable`;
  - **no signing configuration** (`CSC_IDENTITY_AUTO_DISCOVERY=false` in CI to stop electron-builder probing for certificates).
- [ ] **2.10** Add `desktop` job matrix: `ubuntu-latest`, `windows-latest`, `macos-26`. On Linux install `flatpak flatpak-builder elfutils zstd rpm` and the Flatpak `25.08` runtime/SDK/BaseApp before `electron-builder`.
- [ ] **2.11** Add Playwright Electron smoke test (`tests-e2e/electron.spec.ts`):
  - launch, wait for `window.__XMPP_P2P_BRIDGE__`;
  - assert `getLocalJid()` returns a stable JID;
  - restart and assert the SQLite-backed JID is unchanged;
  - send a message to a spawned Node peer and assert delivery.
- [ ] **2.12** Document the unsigned-build caveats in `README.md`: macOS Gatekeeper right-click-open / `xattr -dr com.apple.quarantine`, Windows SmartScreen "More info → Run anyway".
- [ ] **2.13** Optional: `electron-updater` against GitHub Releases (phase 4).

**Exit criteria:** unsigned installers build on all three OSes; app starts offline; identity persists across restart; a desktop peer can message a web peer through a relay; no renderer Node access; no TUI binary shipped.

---

### Phase 3 — Android + ZapStore (5–8 days)

Goal: a signed APK built in CI and published to ZapStore under the existing publisher identity.

#### 3.1 Capacitor setup

- [ ] **3.2** Add `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` (8.x) as dev/runtime deps.
- [ ] **3.3** Add `capacitor.config.ts` at repo root:
  - `webDir: 'ui/dist'`;
  - `appId` = the permanent ID chosen in 0.7, `appName: 'Nexus'`;
  - `server.androidScheme: 'https'`, `hostname: 'localhost'` (do not change after release — it changes the storage origin);
  - `android.allowMixedContent: false`;
  - `plugins.SystemBars.insetsHandling: 'css'` (Capacitor 8 edge-to-edge).
- [ ] **3.4** `npx cap add android`; commit `android/`.
- [ ] **3.5** Add `npm run android:sync` = `npm run build:web && npx cap sync android`.
- [ ] **3.6** Build variant env: `VITE_TARGET=capacitor` to disable the service worker.

#### 3.2 Runtime changes

- [ ] **3.7** Add `@capacitor/app`:
  - `appStateChange` → background: `bridge.disconnect()`; foreground: re-init client and flush the mailbox;
  - Android hardware back button → navigate back, exit only at the root.
- [ ] **3.8** Add `@capacitor/preferences` or a Keychain/Keystore plugin:
  - mirror the libp2p private key (and encrypted-storage salt) out of IndexedDB;
  - restore on startup if IndexedDB is empty;
  - request `navigator.storage.persist()` on Android, but treat it as best-effort.
- [ ] **3.9** Recovery phrase parity:
  - force the phrase confirmation screen on Android;
  - ensure the phrase restores the same peer ID (move key derivation to the shared module from 0.5).
- [ ] **3.10** WSS-only validation:
  - in `SettingsPage`/`ServerSetupPage`, reject `ws://`/`http://` when running in Capacitor (cleartext is blocked by Android anyway);
  - keep `wss://` + valid cert.
- [ ] **3.11** Set `clientMode: true` for KadDHT when running on mobile (add an option to `createBrowserP2PNode` / `createBaseLibp2pServices`). A phone should not serve DHT routing.
- [ ] **3.12** Safe areas / status bar: verify the UI under edge-to-edge; add `env(safe-area-inset-*)` padding where needed.
- [ ] **3.13** Android manifest: confirm `INTERNET`; no cleartext; add `android:usesCleartextTraffic="false"`.

#### 3.3 Signing (reuse the Mangatsu/scrollstr key)

- [ ] **3.14** Import the existing secret names and values from `Mangatsu`:
  - `ANDROID_KEYSTORE_BASE64`
  - `ANDROID_KEYSTORE_PASSWORD`
  - `ANDROID_KEY_ALIAS`
  - `ANDROID_KEY_PASSWORD`
  Copy the values from the Mangatsu/scrollstr setup; do not generate a new keystore.

  One-time setup (GitHub cannot copy secrets between repos; the values must come from the password manager, not `gh secret list`):

  ```bash
  gh secret set ANDROID_KEYSTORE_BASE64 --repo imattau/XMPP_P2P < keystore.b64
  gh secret set ANDROID_KEYSTORE_PASSWORD --repo imattau/XMPP_P2P
  gh secret set ANDROID_KEY_ALIAS --repo imattau/XMPP_P2P
  gh secret set ANDROID_KEY_PASSWORD --repo imattau/XMPP_P2P
  gh secret set ZAPSTORE_NSEC --repo imattau/XMPP_P2P
  ```

  Reference: `Mangatsu/docs/android-build.md` and `Mangatsu/.github/workflows/android.yml`.
- [ ] **3.15** Add a committed `signingConfigs.release` to `android/app/build.gradle` that reads those values from environment variables (or a CI-written `keystore.properties`, mirroring Mangatsu's pattern) and assign it to the `release` build type. Add `android/keystore.properties`, `*.jks` and `*.keystore` to `.gitignore`.
- [ ] **3.16** Versioning:
  - `versionName` from `package.json`;
  - `versionCode` from `GITHUB_RUN_NUMBER` (monotonic; ZapStore rejects a lower `version_code`);
  - never reuse a version code.
- [ ] **3.17** Build **APK only** (`./gradlew assembleRelease`); AAB is not needed for ZapStore.
  - verify with `apksigner verify --print-certs`;
  - name the artifact `nexus-v<version>.apk`.

#### 3.4 ZapStore publication

- [ ] **3.18** Add `zapstore.yaml` at the repo root:

```yaml
repository: https://github.com/imattau/XMPP_P2P
name: Nexus
summary: Decentralized, serverless messaging over XMPP P2P
description: |
  Nexus is a peer-to-peer XMPP client. Messages, presence, group chats and
  feeds are routed directly between peers over libp2p, with no home server.
  Supports OMEMO end-to-end encryption, decentralized MUC rooms and DHT-backed
  offline mailboxes.
license: LGPL-2.1-or-later
website: https://github.com/imattau/XMPP_P2P
icon: assets/zapstore-icon.png
release_source: https://github.com/imattau/XMPP_P2P
pubkey: npub1...   # npub derived from the reused ZAPSTORE_NSEC
metadata_sources: []
tags: [messaging, chat, xmpp, p2p, decentralized]
```

- [ ] **3.19** Add `assets/zapstore-icon.png` (512×512 PNG; the current `icon-512.svg` is not enough).
- [ ] **3.20** Set `pubkey` to the npub that matches the reused `ZAPSTORE_NSEC`. ZapStore whitelists the publisher by fetching this file from the repository.
- [ ] **3.21** Certificate linking: the reused keystore is already linked to the shared publisher identity from Mangatsu. Verify with `zsp identity --link-key` locally if ZapStore reports a certificate mismatch; this is a one-time step requiring the keystore.
- [ ] **3.22** CI publish steps, after the GitHub Release is created (ZapStore fetches the APK from the release asset):

```yaml
- uses: actions/setup-go@v5
  with: { go-version: stable }
- run: go install github.com/zapstore/zsp/cmd/zsp@latest
- name: Publish to Zapstore
  if: github.event_name == 'push' || inputs.publish_to_zapstore == true
  env:
    SIGN_WITH: ${{ secrets.ZAPSTORE_NSEC }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    export PATH="$(go env GOPATH)/bin:$PATH"
    zsp publish --quiet --skip-preview zapstore.yaml
```

- [ ] **3.23** Trigger rules:
  - `v*` tag → signed APK, GitHub Release asset, ZapStore publish;
  - `workflow_dispatch` with `release: true` → build without publishing;
  - `workflow_dispatch` with `publish_to_zapstore: true` → re-broadcast an existing release (optionally `--overwrite-release`).

  **Note:** `zsp` v0.5.13 (current `@latest`) does **not** implement `--check`; the
  released CLI rejects the flag. Validate the config on a throwaway `v0.0.1-test`
  tag instead, or pin a `zsp` version that supports `--check` if one becomes
  available. Do not add a `--check` step to CI with the current version.
- [ ] **3.24** First-publish check: run the workflow on a `v0.0.1-test` tag, install from ZapStore, confirm the certificate and package ID, then delete the test release/event if needed.

#### 3.5 Device smoke checklist

- [ ] **3.25** fresh install → onboarding → JID;
- [ ] kill/relaunch → same JID;
- [ ] ZapStore update with a higher `versionCode` → same JID and data;
- [ ] background 5 min → foreground → mailbox sync;
- [ ] send/receive with desktop and web peers;
- [ ] OMEMO 1:1 and MUC;
- [ ] file upload;
- [ ] no cleartext errors in logcat.

**Exit criteria:** signed APK from CI, attached to a GitHub Release and published to ZapStore; installs and updates on API 24+; identity survives relaunch, update and ZapStore reinstall-over-install; interops with desktop and web.

---

### Phase 4 — Release automation and hardening (3–5 days)

- [ ] **4.1** New `.github/workflows/release.yml` on `v*` tags + `workflow_dispatch`:
  - `test` (reuse `ci.yml` logic);
  - `web` → `ui-dist` artifact;
  - `desktop` matrix → unsigned `release/**` artifacts;
  - `android` → signed APK, GitHub Release asset, ZapStore publish;
  - desktop and Android jobs attach their own artifacts to the GitHub Release.
- [ ] **4.2** Cache: npm, `~/.gradle`, `~/.cache/electron`, Go modules/build cache, Playwright browsers.
- [ ] **4.3** Secrets (repository), all reused from the Mangatsu/scrollstr setup:
  - `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`;
  - `ZAPSTORE_NSEC`.
  - No desktop signing secrets in v1.
- [ ] **4.4** TUI: not packaged. Keep `npm start`/`src/tui` as a developer/server tool and state that the desktop app ships the React UI only.
- [ ] **4.5** Interop matrix test on release candidates:
  - desktop ↔ web, desktop ↔ Android, Android ↔ web;
  - direct messaging, MUC, feed, OMEMO, uploads.
- [ ] **4.6** Update `README.md` with build/run/release instructions, unsigned-build caveats and ZapStore install link.
- [ ] **4.7** Optional: ZapStore listing polish (screenshots, `release_notes`, `min_allowed_version_code`).

---

## 6. CI workflow sketch

```yaml
name: Release
on:
  push:
    tags: ['v*']
  workflow_dispatch:

permissions:
  contents: write

jobs:
  web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci --legacy-peer-deps
      - run: npm ci --prefix ui --legacy-peer-deps
      - run: VITE_TARGET=web npm run build:web
      - uses: actions/upload-artifact@v4
        with: { name: web-dist, path: ui/dist }

  desktop:
    needs: web
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
          - os: windows-latest
          - os: macos-26
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci --legacy-peer-deps
      - run: npm ci --prefix ui --legacy-peer-deps
      - uses: actions/download-artifact@v4
        with: { name: web-dist, path: ui/dist }
      - run: npm run build
      - run: npm run build:electron
      - run: npx electron-builder --publish never
      - uses: actions/upload-artifact@v4
        with: { name: desktop-${{ matrix.os }}, path: release/* }
      - name: Attach desktop installers to GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with: { files: release/* }

  android:
    needs: web
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: 21 }
      # ubuntu-latest ships the Android SDK preinstalled; android-actions/setup-android@v3
      # currently fails because it installs the removed legacy "tools" package.
      - name: Add Android cmdline-tools to PATH
        run: |
          CMDLINE_TOOLS_BIN=$(dirname "$(find "$ANDROID_HOME/cmdline-tools" -maxdepth 3 -name sdkmanager | sort -V | tail -1)")
          echo "$CMDLINE_TOOLS_BIN" >> "$GITHUB_PATH"
      - run: yes | sdkmanager --licenses > /dev/null
      - run: npm ci --legacy-peer-deps
      - run: npm ci --prefix ui --legacy-peer-deps
      - uses: actions/download-artifact@v4
        with: { name: web-dist, path: ui/dist }
      - name: Write signing config
        env:
          ANDROID_KEYSTORE_BASE64: ${{ secrets.ANDROID_KEYSTORE_BASE64 }}
          ANDROID_KEYSTORE_PASSWORD: ${{ secrets.ANDROID_KEYSTORE_PASSWORD }}
          ANDROID_KEY_ALIAS: ${{ secrets.ANDROID_KEY_ALIAS }}
          ANDROID_KEY_PASSWORD: ${{ secrets.ANDROID_KEY_PASSWORD }}
        run: |
          KEYSTORE_PATH="$RUNNER_TEMP/release.keystore"
          echo "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$KEYSTORE_PATH"
          cat > android/keystore.properties <<EOF
          storeFile=$KEYSTORE_PATH
          storePassword=$ANDROID_KEYSTORE_PASSWORD
          keyAlias=$ANDROID_KEY_ALIAS
          keyPassword=$ANDROID_KEY_PASSWORD
          EOF
      - run: node scripts/sync-version.mjs
      - run: npx cap sync android
      - run: cd android && ./gradlew assembleRelease
      - name: Verify APK signature
        run: |
          APK=$(find android/app/build/outputs/apk/release -name '*.apk' | head -1)
          APKSIGNER=$(find "$ANDROID_HOME/build-tools" -name apksigner | sort -V | tail -1)
          "$APKSIGNER" verify --print-certs "$APK"
      - name: Attach APK to GitHub Release
        if: startsWith(github.ref, 'refs/tags/v')
        uses: softprops/action-gh-release@v2
        with:
          files: android/app/build/outputs/apk/release/*.apk
      - uses: actions/setup-go@v5
        with: { go-version: stable }
      - run: go install github.com/zapstore/zsp/cmd/zsp@latest
      - name: Validate Zapstore config
        if: startsWith(github.ref, 'refs/tags/v')
        run: |
          export PATH="$(go env GOPATH)/bin:$PATH"
          zsp publish --check zapstore.yaml
      - name: Publish to Zapstore
        if: github.event_name == 'push' || inputs.publish_to_zapstore == true
        env:
          SIGN_WITH: ${{ secrets.ZAPSTORE_NSEC }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          export PATH="$(go env GOPATH)/bin:$PATH"
          zsp publish --quiet --skip-preview zapstore.yaml
```

Notes:

- `desktop` needs `dist/electron/main.js`; add a `build:electron` step (tsc with a second tsconfig or esbuild).
- Set `CSC_IDENTITY_AUTO_DISCOVERY=false` for desktop builds so electron-builder does not probe for signing identities.
- macOS desktop builds must run on a macOS runner. `macos-26` has Xcode 26, which is irrelevant here but is the current GA image.
- Android produces one universal APK; ZapStore's APK ranking picks it automatically. If ABI splits are added later, add a `match` regex to `zapstore.yaml`.
- `zsp` runs **after** the GitHub Release asset exists, because `release_source` points at the repository release.
- Do not build iOS.

---

## 7. Testing matrix

| Layer | Web | Desktop | Android |
|---|---|---|---|
| Unit/typecheck | `npm test`, `npm --prefix ui test` | same | same |
| Browser e2e | Playwright (existing) | Playwright Electron | n/a |
| Packaging | artifact install | launch unsigned installer, offline start | install/update via ZapStore |
| Identity | IndexedDB + phrase | SQLite + phrase | IndexedDB + secure mirror + phrase |
| Connectivity | WSS relay + WebRTC | TCP/mDNS + relay | WSS relay + WebRTC |
| Persistence | reload | restart app | relaunch + app update |
| Interop | ↔ desktop, ↔ Android | ↔ web, ↔ Android | ↔ desktop, ↔ web |

---

## 8. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `node:sqlite` missing/experimental in Electron | Desktop blocked | Phase 0 spike; fallback to `better-sqlite3` (native rebuild) or JSON storage. |
| IPC bridge surface is large (~60 methods) | Desktop delay | Auto-generate method proxies from the `XmppRuntimeBridge` interface; explicit wiring only for events; add a contract test that fails when a method is missing. |
| Sandboxed preload cannot be ESM | App fails to start | Bundle preload to CJS (`preload.cjs`); keep main ESM. |
| Android WebView storage eviction | Identity loss | Secure-storage mirror + recovery phrase; `persist()` best-effort. |
| Android background suspension | Messages delayed | Accept foreground-only v1; mailbox sync on resume; document. Push is a separate project. |
| WebRTC in Android WebView | Connectivity gaps | Test on a real device; fall back to WSS relay + circuit relay. |
| Cleartext blocked | Bootstrap fails silently | WSS-only validation in settings; clear error UI. |
| Service worker in native shells | Stale assets | Disable SW for `VITE_TARGET=capacitor|electron`. |
| Unsigned Windows/macOS builds | SmartScreen/Gatekeeper warnings | Accept for v1; document right-click-open / `xattr -dr` and "More info → Run anyway". |
| macOS runner cost | Slow releases | Build macOS only on tags, not PRs. |
| Double identity if renderer also starts a browser node | Confusing UX | Preload injects the bridge before React; assert only one `XmppNode` exists in the smoke test. |
| ZapStore rejects a lower `versionCode` | Update blocked | `versionCode` from `GITHUB_RUN_NUMBER`; never reuse a code; test on a throwaway tag. |
| `applicationId` changed after first release | New app, no updates | Fix it in Phase 0 (0.7) and treat it as immutable. |
| APK not attached before `zsp publish` | ZapStore fetch fails | Run `softprops/action-gh-release` before the `zsp` step; `release_source` points at the release. |
| Reused signing key lost | Cannot update the app | Back up the keystore and passwords outside GitHub; secrets are not readable back. |
| ZapStore publisher not whitelisted | Publish rejected | Commit `zapstore.yaml` with the correct `pubkey`; the reused identity is already established. |
| Certificate mismatch on first publish | Install/verification failure | Reuse the Mangatsu/scrollstr keystore and linked identity; verify with `zsp identity --link-key` if needed. |

---

## 9. File map

**New**

```
src/electron/main.ts
src/electron/preload.ts
src/electron/bridge-ipc.ts
src/electron/bridge-contract.ts
src/electron/static-server.ts
src/core/identity-key.ts
electron-builder.yml
capacitor.config.ts
android/...                      # generated by `npx cap add android`, committed
zapstore.yaml                    # ZapStore listing + APK source
assets/zapstore-icon.png         # 512x512 PNG for ZapStore
scripts/build-preload.mjs
scripts/sync-version.mjs
tests-e2e/electron.spec.ts
.github/workflows/release.yml
```

**Changed**

```
package.json                     # scripts, deps, main → dist/electron/main.js
tsconfig.json / tsconfig.electron.json
ui/vite.config.ts                # SW off for native targets
ui/index.html                    # target-aware SW registration if needed
ui/src/bridge/runtime.ts         # native-shell bridge detection (small)
ui/src/app/Root.tsx              # verify skip path; no rewrite expected
ui/src/pages/onboarding/ReadyPage.tsx
ui/src/pages/onboarding/ServerSetupPage.tsx
src/core/p2p.ts                  # privateKey option
src/core/p2p-browser.ts          # DHT clientMode option
src/browser-index.ts             # use shared key derivation
src/bridge/browser-runtime.ts    # optional emit-sink refactor
android/app/build.gradle         # release signing config + versionCode
README.md
```

---

## 10. Milestones

| Milestone | Content | Estimate |
|---|---|---|
| M0 | Phase 0 foundations + Electron spike | 2–4 d |
| M1 | Web artifact + PWA target | 1–2 d |
| M2 | Desktop shell, IPC bridge, unsigned installers | 6–10 d |
| M3 | Android shell, lifecycle, storage, signing | 5–8 d |
| M4 | Release workflow, ZapStore publish, interop matrix | 3–5 d |

Total: **~3–5 weeks** for one developer; M2 and M3 can run in parallel.

Suggested order for a single developer: **M0 → M1 → M3 (Android, lower risk) → M2 (Desktop) → M4**, because Android validates the browser runtime under a real mobile WebView before the larger desktop IPC work.

---

## 11. Decisions and remaining questions

Decided:

1. **Desktop identity model:** single native identity via IPC (D3), implemented.
2. **Android `applicationId`:** `app.nexus.xmpp`, implemented in `capacitor.config.ts` and `android/app/build.gradle`.
3. **ZapStore icon:** generated a 512×512 PNG placeholder at `assets/zapstore-icon.png` from the web icon.
4. **TUI:** not packaged.
5. **Signing:** desktop/web unsigned; Android signed with the shared Mangatsu/scrollstr key.
6. **Secrets:** all five repository secrets set from `~/.config/nostr-release/signing.env`.
7. **ZapStore `pubkey`:** added to `zapstore.yaml`.

Remaining:

1. **Default bootstrap relay:** which `wss://` relay ships in web/Android builds by default?
2. **Auto-update:** include `electron-updater` in v1 or defer?
3. **Store metadata:** screenshots and optional `min_allowed_version_code` for the ZapStore listing.
