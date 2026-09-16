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
2. Tap **START SPIN**. Allow the camera if you want a live capture; if you deny it or none is available, a bundled demo spin still runs.
3. After the timed capture, use **Preview** or **Share**. With **Slow-mo / time ramp** on (Settings, default), preview ramps live and Download / Share bake the slow-mo file. Turn it off for normal-speed preview and files.
4. **Gallery** lists tonight’s clips. **Settings** picks the cloud destination (Vercel Blob or Google Drive), force-offline chip, and mock battery %.

Local demo works **without** Blob or Drive credentials: Share stays on this tablet and the QR uses `http://localhost:3000`. Guest phones cannot load that clip until you deploy with storage (below).

Add to Home Screen from the tablet browser for a PWA-like standalone shell (`display: standalone` in the web manifest).

## Guest QR / cloud storage (production)

Clips are captured into IndexedDB on the operator tablet. Guest phones on the venue Wi‑Fi still need a **public HTTPS origin** plus **cloud storage**. In **Settings → Cloud destination** pick **Vercel Blob** (default) or **Google Drive**. A LAN IP or a static deploy without storage is not enough.

### Environment

Copy `.env.example` to `.env.local` (never commit tokens):

| Variable | Required | Purpose |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | For Blob sharing | Vercel Blob read-write token. Create a Blob store in the Vercel project **Storage** tab (public access). Include the **Development** environment if you want local uploads. |
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
4. **Storage** → Create Blob store → connect it to this project (Production + Preview; Development optional). This injects `BLOB_READ_WRITE_TOKEN`.
5. Set `NEXT_PUBLIC_APP_URL` to the production domain (Project → Settings → Environment Variables).
6. Deploy. Open the booth on the tablet **at that HTTPS URL**, capture a spin, tap **Share** — wait until the status reads “Live for guest phones” (Blob) or “Live on Google Drive”, then guests scan the QR.

Without storage credentials, Share shows **Local-only share** (Blob) or asks you to connect Drive. `/s/[clipId]` on another device returns “clip not available” until an upload succeeds.

### Vercel Blob (default)

Opening operator Share **bakes the time-ramp**, then uploads with `@vercel/blob` **client upload** (files can exceed the 4.5 MB Function body limit) to `shares/{clipId}/export.*`, then writes `shares/{clipId}/meta.json`. `/s/[clipId]` loads IndexedDB when present, otherwise `GET /api/share/[clipId]`.

The original capture stays in IndexedDB. Guests who **Save to gallery** or fetch the cloud clip get the baked file.

### Google Drive

Drive is an alternative destination, not a replacement for Blob. Keep Blob enabled if you want branded `/s/[clipId]` metadata in addition to Drive-hosted video.

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
5. Capture a spin → **Share**. Status should read **Live on Google Drive**.

If auth fails, Share shows a clear error. Local preview and Download still work.

#### 3. Guest links

Each upload is shared as **anyone with the link can view**.

| Setup | QR / copy / SMS | Guest player |
| --- | --- | --- |
| Drive + Blob token | `/s/[clipId]` on your domain | Branded page; video iframe from Drive |
| Drive only (no Blob) | `/s/[clipId]?d={fileId}&…` on your domain | Branded page using query params + Drive iframe |
| Blob destination | `/s/[clipId]` | Branded page; video from Blob CDN |

Guests can also open the Drive `webViewLink` directly. Download on a guest phone opens Drive’s download URL.

#### Blob vs Drive

| | Vercel Blob | Google Drive |
| --- | --- | --- |
| Where the file lives | Vercel Blob CDN | Operator’s Google Drive |
| Operator connect step | Token in Vercel env | OAuth Connect in Settings |
| Guest playback | `<video>` from CDN | Drive preview iframe (`anyone with link`) |
| Metadata for `/s/[clipId]` | `shares/{id}/meta.json` | Blob meta if Blob is also configured; otherwise query params on the QR |
| Offline booth | Local-only | Local-only |

The original capture stays in IndexedDB. Guests who **Save to gallery** or fetch the cloud clip get the baked file, so slow-mo plays in Photos / Files without this app’s `playbackRate` logic.


## Screens

| Route | Purpose |
| --- | --- |
| `/` | Events list — create / select tonight’s event |
| `/events/new` | New event setup |
| `/e/[eventId]` | Event setup — name, date, couple names, accent, logo, music bed label, frame style |
| `/e/[eventId]/capture` | Operator capture (mockup 1) |
| `/e/[eventId]/gallery` | Tonight’s clips |
| `/e/[eventId]/settings` | Device name, mock battery, **slow-mo on/off**, force offline, **Blob vs Drive destination**, Google Drive connect |
| `/e/[eventId]/share/[clipId]` | Operator guest-share screen (mockup 2) |
| `/s/[clipId]` | Share page encoded in the QR |

## What’s real vs simulated

**Real in this MVP**

- `getUserMedia` capture when the browser allows it (typically ~10s)
- Fallback to a live canvas demo scene, then a bundled `/demo/spin.mp4` if recording fails
- IndexedDB persistence for events, clip metadata, and video blobs (`idb`)
- Guest QR (public origin + `/s/[clipId]`) via `qrcode.react`
- **Vercel Blob** cloud clips so guest phones can open `/s/[clipId]` without IndexedDB
- **Google Drive** destination: OAuth connect in Settings, baked upload to `360show/{event}/`, anyone-with-link guest playback
- Copy link, `sms:` “Text me”, download when a blob, demo file, or cloud URL exists
- **Live time-ramp preview**: `playbackRate` keyframes when **Slow-mo / time ramp** is on (Settings)
- **Baked slow-mo export**: same ramp re-encoded for Download / Share when slow-mo is on; skipped when off
- Event frames overlaid on **web preview** (gold oval, neon ring, midnight arch, classic plaque, minimal, **Christian Fellowship** PNG pack) — not composited into the downloaded file yet
- **Christian Fellowship** look-pack: navy/gold plaque overlay (`/frames/christian-fellowship.png`), default accent `#C9A227`, gentle slow-mo ramp (no freeze-flash)
- Force-offline chip, mock battery, Camera OK / demo status

**Simulated / stubbed (extension points)**

- **Platform motor** — `src/lib/hardware/motor.ts` (`createStubMotor`). Swap in serial / BLE / USB without changing capture orchestration.
- **GoPro** — `src/lib/hardware/gopro.ts`. Unused on the live path; capture uses the tablet/USB camera.
- **Frame burned into the file** — overlays stay on the web player; the download is ramp-baked video only.
- **Music bed** — stored as a label only (no audio mix).
- **TV mirror / AI frames** — not built.

## Stack

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4
- Client-heavy UI, local-first (`IndexedDB`) with optional Vercel Blob or Google Drive for guest sharing
- `lucide-react` icons, `qrcode.react` QR codes, `@vercel/blob`

## Capture pipeline

`START SPIN` → 3-2-1 countdown → timed record → save original → if slow-mo is on, background-bake the time-ramp → gallery / share (upload uses baked file when slow-mo is on).

Hardware calls sit beside that: `motor.spin(durationMs)` is invoked during record so a future motor implementation can run in lockstep.

## Baked export vs live preview

| Surface | Time-ramp | Frame overlay |
| --- | --- | --- |
| Operator **Preview** / booth share player | Live `playbackRate` on the original capture | Web overlay |
| Guest `/s/[clipId]` after cloud upload | File is already baked; player runs at 1× | Web overlay |
| **Download / Save to gallery** | Baked into the file (slow-mo without this app) | Not in the file (web only) |
| Vercel Blob `export.*` | Baked once on the booth before upload | Not in the file |
| Google Drive (anyone-with-link) | Baked file uploaded from the booth | Not in the file |

Bake uses a hidden `<video>` + canvas `captureStream` + `MediaRecorder`. It follows the clip’s ramp profile (`time-ramp-v1` freeze vs `time-ramp-gentle`). Wall-clock encode is longer than the 10s source (typically tens of seconds). The original blob remains in IndexedDB for recapture/debug.

**Settings → Slow-mo / time ramp** (default on) controls this. Off: Preview plays at 1× and Download / Share upload the original capture (no bake). Guest pages honor `slowMoEnabled` on the cloud share so they do not re-apply a live ramp.

## Design

Dark charcoal (`#05080f` / `#0a101c`), white type, electric blue (`#3B82F6`), green Camera OK. Large touch targets, landscape and portrait. Event name stays on Capture and Share.

## Future

- GoPro Open GoPro / USB webcam ingest
- Real platform motor (ESP32 / GRBL / vendor SDK)
- Server-side mix of a music bed onto the baked export
- AI / custom frame builder
- HDMI / TV mirror for the crowd display
- Burn the selected frame overlay into the baked export
