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
3. After the timed capture, use **Preview** (live time-ramp on the original) or **Share** (guest QR). Download / Save / cloud upload use a **baked slow-mo** file.
4. **Gallery** lists tonight’s clips. **Settings** can force the Offline chip and mock battery %.

Local demo works **without** Blob credentials: Share stays on this tablet and the QR uses `http://localhost:3000`. Guest phones cannot load that clip until you deploy with storage (below).

Add to Home Screen from the tablet browser for a PWA-like standalone shell (`display: standalone` in the web manifest).

## Guest QR / Vercel Blob (production)

Clips are captured into IndexedDB on the operator tablet. Guest phones on the venue Wi‑Fi still need a **public HTTPS origin** plus **cloud object storage** — a LAN IP or a static deploy without Blob is not enough.

### Environment

Copy `.env.example` to `.env.local` (never commit tokens):

| Variable | Required | Purpose |
| --- | --- | --- |
| `BLOB_READ_WRITE_TOKEN` | For guest sharing | Vercel Blob read-write token. Create a Blob store in the Vercel project **Storage** tab (public access). Include the **Development** environment if you want local uploads. |
| `NEXT_PUBLIC_APP_URL` | Recommended in production | Public site origin used in QR, copy-link, and SMS, e.g. `https://your-app.vercel.app` (no trailing slash). |

On Vercel, if `NEXT_PUBLIC_APP_URL` is unset, share links fall back to `https://$VERCEL_URL`. In local `npm run dev` they fall back to `window.location.origin`.

**Use the deployed URL in the QR, not a `192.168.*` / LAN IP.** Phones must reach Vercel (and the Blob CDN), not the booth tablet.

### Deploy from this GitHub repo

1. Push `main` (or this branch `cursor/snap360-operator-mvp-8fb6`) to GitHub.
2. In [Vercel](https://vercel.com) → **Add New Project** → import `freddyja/360show`.
3. Framework preset: Next.js. Build command `npm run build`, output as default.
4. **Storage** → Create Blob store → connect it to this project (Production + Preview; Development optional). This injects `BLOB_READ_WRITE_TOKEN`.
5. Set `NEXT_PUBLIC_APP_URL` to the production domain (Project → Settings → Environment Variables).
6. Deploy. Open the booth on the tablet **at that HTTPS URL**, capture a spin, tap **Share** — wait until the status reads “Live for guest phones”, then guests scan the QR.

Without `BLOB_READ_WRITE_TOKEN`, Share shows **Local-only share** and `/s/[clipId]` on another device returns “clip not available”.

### How it works

Opening operator Share **bakes the time-ramp** into a new file (canvas + `MediaRecorder`), then uploads that export with `@vercel/blob` **client upload** (files can exceed the 4.5 MB Function body limit) to `shares/{clipId}/export.*`, then writes `shares/{clipId}/meta.json` (event branding + video URL, `baked: true`). `/s/[clipId]` loads IndexedDB when present, otherwise `GET /api/share/[clipId]`.

The original capture stays in IndexedDB. Guests who **Save to gallery** or fetch the cloud clip get the baked file, so slow-mo plays in Photos / Files without this app’s `playbackRate` logic.


## Screens

| Route | Purpose |
| --- | --- |
| `/` | Events list — create / select tonight’s event |
| `/events/new` | New event setup |
| `/e/[eventId]` | Event setup — name, date, couple names, accent, logo, music bed label, frame style |
| `/e/[eventId]/capture` | Operator capture (mockup 1) |
| `/e/[eventId]/gallery` | Tonight’s clips |
| `/e/[eventId]/settings` | Device name, mock battery, force offline, about |
| `/e/[eventId]/share/[clipId]` | Operator guest-share screen (mockup 2) |
| `/s/[clipId]` | Share page encoded in the QR |

## What’s real vs simulated

**Real in this MVP**

- `getUserMedia` capture when the browser allows it (typically ~10s)
- Fallback to a live canvas demo scene, then a bundled `/demo/spin.mp4` if recording fails
- IndexedDB persistence for events, clip metadata, and video blobs (`idb`)
- Guest QR (public origin + `/s/[clipId]`) via `qrcode.react`
- **Vercel Blob** cloud clips so guest phones can open `/s/[clipId]` without IndexedDB
- Copy link, `sms:` “Text me”, download when a blob, demo file, or cloud URL exists
- **Live time-ramp preview**: `playbackRate` keyframes (normal → slow-mo → freeze) in `RampPlayer` on the original capture
- **Baked slow-mo export**: the same ramp is re-encoded into a new WebM/MP4 (`ensureBakedClip`) for Download / Save and Vercel Blob guest shares. Original stays in IndexedDB. Christian Fellowship uses the gentle ramp (no freeze-flash)
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
- Client-heavy UI, local-first (`IndexedDB`) with optional Vercel Blob for guest sharing
- `lucide-react` icons, `qrcode.react` QR codes, `@vercel/blob`

## Capture pipeline

`START SPIN` → 3-2-1 countdown (camera or demo preview) → timed record via `MediaRecorder` → save original clip + blob → background bake of the time-ramp → gallery / share (upload prefers the baked export).

Hardware calls sit beside that: `motor.spin(durationMs)` is invoked during record so a future motor implementation can run in lockstep.

## Baked export vs live preview

| Surface | Time-ramp | Frame overlay |
| --- | --- | --- |
| Operator **Preview** / booth share player | Live `playbackRate` on the original capture | Web overlay |
| Guest `/s/[clipId]` after cloud upload | File is already baked; player runs at 1× | Web overlay |
| **Download / Save to gallery** | Baked into the file (slow-mo without this app) | Not in the file (web only) |
| Vercel Blob `export.*` | Baked once on the booth before upload | Not in the file |

Bake uses a hidden `<video>` + canvas `captureStream` + `MediaRecorder`. It follows the clip’s ramp profile (`time-ramp-v1` freeze vs `time-ramp-gentle`). Wall-clock encode is longer than the 10s source (typically tens of seconds). The original blob remains in IndexedDB for recapture/debug.

## Design

Dark charcoal (`#05080f` / `#0a101c`), white type, electric blue (`#3B82F6`), green Camera OK. Large touch targets, landscape and portrait. Event name stays on Capture and Share.

## Future

- GoPro Open GoPro / USB webcam ingest
- Real platform motor (ESP32 / GRBL / vendor SDK)
- Server-side mix of a music bed onto the baked export
- AI / custom frame builder
- HDMI / TV mirror for the crowd display
- Burn the selected frame overlay into the baked export
