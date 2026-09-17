# 360show

Tablet-first **360 photo booth operator** app (Snap360-style). An event operator runs it on an iPad or Android tablet: guests spin, get a stylized slow-mo clip, and share via QR. Offline-first. No paid APIs.

This is a shippable demo MVP. Real platform motor / GoPro control is stubbed with clear extension points.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). First launch seeds a sample event: **Maya & Jordan**.

1. **Open booth** on the sample event (or create your own).
2. Tap **START SPIN**. Capture length is **10, 15, or 20 seconds** (Event setup → Spin length, default 10s). Allow the camera if you want a live capture; if you deny it or none is available, a bundled demo spin still runs.
3. After the timed capture, use **Preview** or **Share**. With **Slow-mo / time ramp** on (Settings, default), preview ramps live and Download / Share bake the slow-mo file. Turn it off for normal-speed preview and files. If the event has a music bed (not None), it loops under spin / preview / share and is mixed into the export when the browser can record audio. The selected **look-pack frame** is composited into that same baked file.
4. **Gallery** lists tonight’s clips. **Settings** picks video quality (1080p high / 720p standard), the cloud destination (Vercel Blob or Google Drive), booth music mute, force-offline chip, and mock battery %. **Open crowd / TV screen** (Capture or Event) opens a full-bleed room display you can cast.
5. **Remote operator:** on the booth phone keep Capture open → **Enable remote control** → scan the QR (or open `/e/[eventId]/remote`) on a laptop. The laptop START SPINs and changes look / booth settings over HTTPS. See [Remote operator](#remote-operator).

Local demo works **without** Blob or Drive credentials: Share stays on this tablet and the QR uses `http://localhost:3000`. Guest phones cannot load that clip until you deploy with storage (below).

Add to Home Screen from the tablet browser for a PWA-like standalone shell (`display: standalone` in the web manifest).

## Guest QR / cloud storage (production)

Clips are captured into IndexedDB on the operator tablet. Guest phones on the venue Wi‑Fi still need a **public HTTPS origin** plus **cloud storage**. In **Settings → Cloud destination** pick **Vercel Blob** (default) or **Google Drive**. A LAN IP or a static deploy without storage is not enough.

### Environment

Copy `.env.example` to `.env.local` (never commit tokens):

| Variable | Required | Purpose |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | For Blob guest share + laptop songs | Token from a **new** Hobby Blob store on Production (and Preview). Do **not** keep pointing at suspended `360show-blob` / `store_QGVEYIOJLDEadPj8`. Token presence is not enough: if the connected store is suspended, the app treats Blob as unavailable and keeps the booth working locally. Remote pairing does not require Blob. |

| `BLOB_ACCESS` | Optional | `public` or `private`. Must match the store. New Vercel Blob stores are often **private**; `put(..., { access: "public" })` against a private store fails. If unset, the app detects the mode. |
| `NEXT_PUBLIC_APP_URL` | Recommended in production | Public site origin used in QR, copy-link, and SMS, e.g. `https://your-app.vercel.app` (no trailing slash). |
| `GOOGLE_CLIENT_ID` | For Drive sharing | OAuth 2.0 Web client ID from Google Cloud Console. |
| `GOOGLE_CLIENT_SECRET` | For Drive sharing | OAuth 2.0 Web client secret. |
| `GOOGLE_REDIRECT_URI` | Optional | Full callback URL. Defaults to `{origin}/api/drive/callback`. Must match the URI registered in Google Cloud. |

On Vercel, if `NEXT_PUBLIC_APP_URL` is unset, share links fall back to `https://$VERCEL_URL`. In local `npm run dev` they fall back to `window.location.origin`.

**Use the deployed URL in the QR, not a `192.168.*` / LAN IP.** Phones must reach Vercel (and Blob CDN or Google Drive), not the booth tablet.

### Deploy from this GitHub repo

1. Push `main` (or this branch `cursor/snap360-operator-mvp-8fb6`) to GitHub.
2. In [Vercel](https://vercel.com) → **Add New Project** → import `freddyja/360show`.
3. Framework preset: Next.js. Build command `npm run build`, output as default.
4. **Storage** → Create a **new** Blob store (Hobby is fine) → connect it to this project for **Production + Preview**. That injects `BLOB_READ_WRITE_TOKEN` for the new store. Do **not** reuse the suspended store `360show-blob` (`store_QGVEYIOJLDEadPj8`). If the new store is **private** (Vercel default), set `BLOB_ACCESS=private` or leave it unset so a tiny put probe can detect it. Public stores work with `BLOB_ACCESS=public`.
5. Set `NEXT_PUBLIC_APP_URL` to the production domain (Project → Settings → Environment Variables).
6. Deploy. Open the booth on the tablet **at that HTTPS URL**, capture a spin, tap **Share** — wait until the status reads “Live for guest phones” (Blob) or “Live on Google Drive”, then guests scan the QR.

Without storage credentials **or while Blob is suspended**, Share shows **Local-only share** (Blob destination) or asks you to connect Drive. Download / Save to gallery still work on the booth. `/s/[clipId]` on another device returns “clip not available” until an upload succeeds (Drive still works if connected).

### Vercel Blob (default)

Opening operator Share **bakes the time-ramp**, then uploads with `@vercel/blob` **client upload** (files can exceed the 4.5 MB Function body limit) to `shares/{clipId}/export.*`, then writes `shares/{clipId}/meta.json`. `/s/[clipId]` loads IndexedDB when present, otherwise `GET /api/share/[clipId]`.

**Use a fresh Hobby store on Production.** The previous store `360show-blob` (`store_QGVEYIOJLDEadPj8`) is suspended on Hobby Advanced Ops until about **2026-10-17**. Point `BLOB_READ_WRITE_TOKEN` (Production + Preview) at the new store’s token. The store id lives in the Vercel Storage UI; the app only needs the token.

Writes use the store’s access mode (`public` or `private`):

- Optional env `BLOB_ACCESS=public|private`. If unset, the server probes with a tiny `put` (not `list`).
- A **private** store rejects `access: "public"`. That used to surface as **Could not save share metadata** on Share.
- Private objects are not guest-fetchable by CDN URL. The app rewrites playback to `/api/share/[clipId]/file`, which streams with the server token.
- If a Blob write still fails, the API returns the underlying Blob error string in JSON so the operator UI can show it.

If the Blob store is **suspended** (Hobby Advanced Ops / limits), Share does not retry uploads in a loop. Status becomes a single line: cloud share is temporarily unavailable; **Download still works on this tablet**. Capture, frames, bake, phone custom songs, and local download keep working.

#### Hobby Advanced Ops (2k/month)

Hobby Blob **Advanced Ops** (`list`, `copy`, …) are what suspended the old store. This app avoids them:

- Remote session / commands / operator pings use **Vercel Runtime Cache** (JSON only), not Blob `list`/`put` every heartbeat.
- Share and music reads use `get` on known paths (`shares/{clipId}/meta.json`, `export.*`, `remote/{eventId}/music.*`).
- Access mode is `BLOB_ACCESS` or a one-time `put` probe — no `list` of the bucket.
- Blob health is a cached `head` (simple op, 15 min TTL) plus a circuit breaker on suspension errors.

Laptop **song upload** and guest video `put` are Simple Ops. Do not add periodic `list` polling.

### Google Drive

Drive is an alternative destination, not a replacement for Blob. Keep Blob enabled if you want branded `/s/[clipId]` metadata in addition to Drive-hosted video. **Drive Share does not require Blob metadata.** If Drive upload succeeds, Share is treated as success even when `meta.json` cannot be written; the QR falls back to `/s/[clipId]?d={fileId}&…`.

#### 1. Create Google Cloud OAuth credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/) → create or select a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen**:
   - User type **External** is fine for a booth (add the operator Google account as a **Test user** while the app is in Testing).
   - App name e.g. `360show`. Scopes used: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.file` (only files this app creates).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**.
5. **Authorized JavaScript origins** (no path):
   - `https://your-app.vercel.app`
   - `http://localhost:3000` (local `npm run dev`)
6. **Authorized redirect URIs**:
   - `https://your-app.vercel.app/api/drive/callback`
   - `http://localhost:3000/api/drive/callback`
7. Copy the client ID and secret into Vercel env (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) for Production + Preview (and Development if you test locally). Redeploy.

If the production domain is not `*.vercel.app`, set `GOOGLE_REDIRECT_URI` to `https://your-domain/api/drive/callback` and register that same URI in Google Cloud.

#### 2. Connect Drive on the booth tablet

1. Open the deployed HTTPS site on the operator tablet.
2. **Settings → Cloud destination → Google Drive**.
3. Optional: set the Drive folder name (default `360show`). Uploads use `360show / {event name} /`.
4. Tap **Connect Google Drive**, sign in, allow access. The refresh token is stored in an **httpOnly cookie on this tablet** (not in IndexedDB).
5. Capture a spin → **Share**. Status should read **Live on Google Drive**. That creates `360show / {event name} /` in the connected Google account (Drive → My Drive). Files this app creates are visible there; `drive.file` scope cannot list your other folders.

If auth fails, Share shows a clear error. Local preview and Download still work. If Blob metadata cannot be saved, Share still succeeds after a Drive upload and warns that the guest link uses Drive query params.

#### 3. Guest links

Each upload is shared as **anyone with the link can view**.

| Setup | QR / copy / SMS | Guest player |
| --- | --- | --- |
| Drive + Blob token | `/s/[clipId]?d={fileId}&…` (and `/s/[clipId]` when meta.json exists) | Branded page; video iframe from Drive |
| Drive only (no Blob), or Blob meta write failed | `/s/[clipId]?d={fileId}&…` on your domain | Branded page using query params + Drive iframe |
| Blob destination | `/s/[clipId]` | Branded page; video from Blob CDN |

Guests can also open the Drive `webViewLink` directly. Download on a guest phone opens Drive’s download URL.

Drive’s in-browser player often never finishes **“This video file is still being processed”** for **WebM**. Bake/export prefers **MP4 / H.264 (+ AAC when mixing audio)** when `MediaRecorder` supports it. If this phone only records WebM, Share shows a hint: download the file or use the Vercel Blob guest QR. Blob `<video>` playback of WebM is unchanged.

#### Blob vs Drive

| | Vercel Blob | Google Drive |
| --- | --- | --- |
| Where the file lives | Vercel Blob CDN | Operator’s Google Drive |
| Operator connect step | Token in Vercel env | OAuth Connect in Settings |
| Guest playback | `<video>` from CDN | Drive preview iframe (`anyone with link`) |
| Metadata for `/s/[clipId]` | `shares/{id}/meta.json` (private stores served via `/api/share/{id}/file`) | Blob meta if Blob write succeeds; otherwise query params on the QR |
| Offline booth | Local-only | Local-only |

The original capture stays in IndexedDB. Guests who **Save to gallery** or fetch the cloud clip get the baked file, so slow-mo plays in Photos / Files without this app’s `playbackRate` logic.


## Screens

| Route | Purpose |
| --- | --- |
| `/` | Events list — create / select tonight’s event |
| `/events/new` | New event setup |
| `/e/[eventId]` | Event setup — name, date, **spin length (10/15/20s)**, couple names, accent, logo, **music bed or song from this phone**, frame style |
| `/e/[eventId]/capture` | Operator capture (mockup 1) — **Open crowd / TV screen**, **Enable remote control** |
| `/e/[eventId]/remote` | Laptop remote operator (pair via QR/`?k=` or 6-character code). START SPIN + look + booth settings |
| `/e/[eventId]/crowd` | Full-bleed TV / room display (idle branding + latest spin) |
| `/e/[eventId]/gallery` | Tonight’s clips |
| `/e/[eventId]/settings` | Device name, mock battery, **video quality**, **slow-mo on/off**, **mute booth music**, force offline, **Blob vs Drive destination**, Google Drive connect |
| `/e/[eventId]/share/[clipId]` | Operator guest-share screen (mockup 2) |
| `/s/[clipId]` | Share page encoded in the QR |

## What’s real vs simulated

**Real in this MVP**

- `getUserMedia` capture when the browser allows it. **Spin length** on Event setup is 10s (default), 15s, or 20s. **High** quality (default) requests 1920×1080 at ~8 Mbps; **Standard** is 1280×720 at ~4 Mbps. MediaRecorder prefers **mp4/H.264** (and AAC when mixing audio), else VP9/VP8 WebM.
- Fallback to a live canvas demo scene, then a bundled `/demo/spin.mp4` if recording fails
- IndexedDB persistence for events, clip metadata, and video blobs (`idb`)
- Guest QR (public origin + `/s/[clipId]`) via `qrcode.react`
- **Vercel Blob** cloud clips so guest phones can open `/s/[clipId]` without IndexedDB
- **Google Drive** destination: OAuth connect in Settings, baked upload to `360show/{event}/`, anyone-with-link guest playback
- Copy link, `sms:` “Text me”, download when a blob, demo file, or cloud URL exists
- **Live time-ramp preview**: `playbackRate` keyframes when **Slow-mo / time ramp** is on (Settings)
- **Baked slow-mo export**: same ramp re-encoded for Download / Share when slow-mo is on; skipped when off
- **Music beds**: original CC0 instrumentals under `/music/`. Looping playback on spin / preview / share; best-effort mix into Download / Share via Web Audio + MediaRecorder. **Song from this phone** stores an operator-picked audio file in IndexedDB (not uploaded except inside a mixed export).
- Event frames overlaid on **web preview** and **burned into Download / Share / Blob / Drive** (gold oval, neon ring, midnight arch, classic plaque, **Christian Fellowship**, **Polaroid stack**, **Disco chrome**, **Black-tie bar**). **Minimal** stays a thin web border only — the file has no extra decoration.
- **Crowd / TV screen** at `/e/[eventId]/crowd` — full-bleed looping latest spin, idle “next spin” branding, optional guest QR. Open from Capture, Event setup, or the laptop remote page.
- **Remote operator** at `/e/[eventId]/remote` — a laptop on the public HTTPS site pairs to the booth phone (Capture armed) and START SPINs plus look/settings. Pair token + short code; no extra accounts.
- **Christian Fellowship** look-pack: navy/gold plaque overlay (`/frames/christian-fellowship.png`), default accent `#C9A227`, gentle slow-mo ramp (no freeze-flash)
- **Polaroid stack**: warm instant-film border + stacked print (`/frames/polaroid-stack.png`), caption strip for couple names, accent `#F5F0E8`, gentle ramp
- **Disco chrome**: silver bezel with specular highlights (`/frames/disco-chrome.png`), accent `#67E8F9`, livelier freeze ramp
- **Black-tie bar**: matte black frame + ivory name plaque (`/frames/black-tie-bar.png`), accent `#0A0A0A`, gentle ramp
- Force-offline chip, mock battery, Camera OK / demo status

**Simulated / stubbed (extension points)**

- **Platform motor** — `src/lib/hardware/motor.ts` (`createStubMotor`). Swap in serial / BLE / USB without changing capture orchestration.
- **GoPro** — `src/lib/hardware/gopro.ts`. Unused on the live path; capture uses the tablet/USB camera.
- **AI / custom frame builder** — not built.

## Stack

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4
- Client-heavy UI, local-first (`IndexedDB`) with optional Vercel Blob or Google Drive for guest sharing
- `lucide-react` icons, `qrcode.react` QR codes, `@vercel/blob`

## Capture pipeline

`START SPIN` → 3-2-1 countdown → timed record (length from Event setup **Spin length**, quality from Settings) → save original → if slow-mo is on, a music bed is selected, **or** the look-pack frame is burnable, background-bake (ramp + mix + frame) at the same quality cap → gallery / share (upload uses that export).

Hardware calls sit beside that: `motor.spin(durationMs)` is invoked during record so a future motor implementation can run in lockstep.

## Baked export vs live preview

| Surface | Time-ramp | Frame overlay |
| --- | --- | --- |
| Operator **Preview** / booth share player | Live `playbackRate` on the original capture | Web overlay (matches the baked look) |
| Guest `/s/[clipId]` after cloud upload | File is already baked; player runs at 1× | In the file (web overlay skipped so it is not doubled) |
| **Download / Save to gallery** | Baked into the file (slow-mo without this app). Music mixed in when the browser allowed it. | Burned into the file |
| Vercel Blob `export.*` | Baked once on the booth before upload | Burned into the file |
| Google Drive (anyone-with-link) | Baked file uploaded from the booth | Burned into the file |
| **Crowd / TV** `/e/[eventId]/crowd` | Live ramp on this device’s original, or 1× if playing a cloud baked URL | Web overlay on the original; skipped when playing a baked cloud file |

Bake uses a hidden `<video>` + canvas `captureStream` + `MediaRecorder`. It follows the clip’s ramp profile (`time-ramp-v1` freeze vs `time-ramp-gentle`). Wall-clock encode is longer than the source clip (10 / 15 / 20s from Event setup, typically tens of seconds of bake). The original blob remains in IndexedDB for recapture/debug.

**Settings → Slow-mo / time ramp** (default on) controls this. Off: Preview plays at 1× and Download / Share skip the slow-mo bake (they still re-encode if a music bed needs mixing **or** the look-pack frame needs burning). Guest pages honor `slowMoEnabled` on the cloud share so they do not re-apply a live ramp.

## Crowd / TV screen

`/e/[eventId]/crowd` is a full-bleed room display. **Open crowd / TV screen** on Capture or Event setup opens it in a new tab; **Copy TV link** copies the HTTPS URL (includes `?c=` for the latest clip when known).

- **Same tablet / same browser profile:** IndexedDB + `BroadcastChannel` / `localStorage`. Cast that tab to the TV. Idle shows event + couple names; countdown/recording flash big type; after a spin the latest clip loops.
- **Second device without the booth session:** it cannot read IndexedDB. After Share uploads, the copied `?c=` link can load the cloud clip. Otherwise it stays on “waiting for next spin”.
- Autoplay is **muted** (browser policy); **Tap for sound** unmutes.

## Remote operator

A laptop (or second browser) controls the **booth phone** over the public HTTPS site — not a LAN IP. The phone stays the camera/capture device with **Capture** open. BroadcastChannel is same-origin only and is **not** used for this.

### How to use

1. On the **booth phone**, open the production site (e.g. `https://360show.vercel.app`) → tonight’s event → **Capture**.
2. Tap **Enable remote control**. The phone shows a QR, HTTPS link, 6-character pair code, and pair status (waiting / paired).
3. On the **laptop**, scan the QR or open `/e/[eventId]/remote` and type the code (or use the `?k=` token in the link). No separate account.
4. Laptop **START SPIN** runs countdown + record **on the phone**. Spin length, frame, bundled music bed, **song from this laptop**, names, accent, slow-mo, quality, mute, and Blob vs Drive apply on the booth for the next spin (and on Capture chrome immediately).
5. Keep Capture open while remote is armed. Navigating away or **Disable remote** takes the laptop offline. Sessions expire after about 4 hours; Enable remote again to rotate the token.

Production remote pairing uses **Vercel Runtime Cache** (small JSON session + commands, shared across serverless instances in a region). That avoids Blob `list`/`put` on every heartbeat — those Advanced Ops are what suspend Hobby Blob stores.

Laptop **song upload** still needs a working Blob store (files are larger than the Runtime Cache 2 MB item limit). While Blob is unavailable, the laptop hides that control and tells you to pick a song on the booth phone (IndexedDB). If Runtime Cache is not available **and** Blob is unusable, **Enable remote control** is disabled with a clear reason — it will not offer a half-broken in-memory channel on production.

Local `npm run dev` without Blob uses Runtime Cache when it works, otherwise an in-memory channel in that Node process (two browsers on localhost work; a second machine will not).

### What the laptop can change

| Control | Where it lands |
| --- | --- |
| START SPIN | Capture on the phone (only while remote is armed and idle) |
| Spin length 10 / 15 / 20s | Event `captureDurationSec` |
| Frame style (all look-packs) | Event `frameStyle` (+ pack default accent when set) |
| Music bed / None | Event `musicBedLabel`. `preferBundledBed` makes the bed win over a stored custom file |
| Song from this laptop | Uploads over the pair channel into booth IndexedDB custom music. **Paused while Vercel Blob is unavailable** — pick the song on the phone instead. |
| Event name, couple names, accent | Event record |
| Slow-mo, video quality, mute booth music | App settings on the phone |
| Cloud destination Blob vs Drive (+ Drive folder name) | App settings. **Connect Google Drive** still runs on the phone (OAuth cookies) |
| Open / copy crowd TV link | Same `/e/[eventId]/crowd` URL; no extra pairing |

Phone-only (shown disabled on the laptop with a reason): Drive OAuth connect, event logo file, camera hardware. The phone’s own music library still cannot be browsed from the laptop — pick a file on the laptop instead.

Strangers cannot spin a random event: the booth creates a pair token (in the QR) and a short code bound to that `eventId`. Commands require the token. The phone executes them only while Capture has remote enabled.

## Music beds

Event setup picks a bed. **None** is silence. Everything else is an original 16-second looping WAV in `public/music/` (see [MUSIC_CREDITS.md](MUSIC_CREDITS.md)). Labels are generic on purpose — there are no commercial recordings (including no “Can't Help Falling in Love”).

| Label | Mood | Typical use |
| --- | --- | --- |
| Cinematic swell | Soft pad | Formal / gentle events |
| Romantic piano | Soft waltz | Weddings, Christian Fellowship |
| First Dance piano | Soft arpeggios | Weddings, gentle events |
| Upbeat house | Party | Club / reception energy |
| Silent disco pulse | Party | Electronic / silent-disco nights |

**Live playback:** an `HTMLAudioElement` loops under operator spin, Preview, and the guest share player. Volume defaults to ~0.28. Browsers block autoplay without a gesture — **START SPIN**, Preview, changing the bed in setup, picking a song, or tapping the share player counts. **Settings → Mute booth music** silences the operator tablet only; guest phones still overlay a bundled bed, and mixed files keep their audio.

**Song from this phone:** Event setup also has **Use song from this phone** (`accept="audio/*"`, mp3/m4a/wav/aac/ogg as the browser allows, max 18 MB). The file stays in IndexedDB on this device (`customMusicBlobId` + display name) and wins over the bed until **Clear custom song**. It is not uploaded to Vercel Blob or Google Drive as a standalone file — only mixed into the exported video when the bake path succeeds. **You are responsible for having the rights to play and share any song you pick.**

**Export mix (best-effort):** Download / Share decode the WAV or the stored custom file with Web Audio, loop it onto a `MediaStreamDestination`, and record it with the canvas video. The recorder **prefers MP4 / H.264 + AAC**, then WebM + Opus. Chrome/Android usually produce a file Photos can play; Drive preview needs MP4. Some browsers (notably iOS Safari, or mp4-only recorders) drop the audio track — then the downloaded file is video-only and the **web player still plays the looping bed or custom song on the booth**. Guest phones only hear a custom song if the mix landed in the file. Drive guest links pass `?m=` so bundled-bed overlay works even without Blob metadata; `?a=1` means the uploaded file already has audio (skip a second overlay on the Drive iframe).

Regenerate assets with `npm run music:generate`. Look-pack PNGs: `npm run frames:generate`.

## Video quality

**Settings → Video quality** (default **High**) is for booth phones with a real camera (e.g. a Samsung Fold 7).

| Profile | Capture + bake cap | Bitrate | Typical use |
| --- | --- | --- | --- |
| **High** (default) | 1920×1080 · 30 fps | ~8 Mbps | Fold / tablet rear camera |
| **Standard** | 1280×720 · 30 fps | ~4 Mbps | Smaller files, weaker devices |

The app asks the browser for 1080p (`facingMode: environment`) and falls back to 720p, then any camera. If `getCapabilities()` reports more than 1080p, capture still **caps at 1080p** — browser `getUserMedia` cannot use the full Fold sensor, and 4K would balloon bake time and cloud size.

Prefer `video/mp4` + H.264 (and AAC when a music bed is mixed) when `MediaRecorder.isTypeSupported`; otherwise VP9/VP8 WebM. That order applies to capture **and** bake so Google Drive preview is not stuck on WebM.

**Files vs Vercel Hobby Blob (1 GB):** a baked high-quality slow-mo clip is often tens of MB. A busy night can fill a 1 GB store; use Google Drive for lots of 1080p clips, or Standard quality, or a paid Blob quota.

Demo fallback (canvas scene / bundled `/demo/spin.mp4`) is unchanged when the camera is denied or missing.

## Design

Dark nightclub wash: hot magenta, cyan, violet, and neon gold, painted on `html`/`body` **and** every `.booth-page` so it still reads on phones if a parent blocks the body (Samsung often ignores `background-attachment: fixed`). Operator shells are light glass, not opaque charcoal. White type, START SPIN, Share, and status chips stay high-contrast.

## Future

- GoPro Open GoPro / USB webcam ingest
- Real platform motor (ESP32 / GRBL / vendor SDK)
- AI / custom frame builder
