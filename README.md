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
3. After the timed capture, use **Preview** (live time-ramp) or **Share** (guest QR screen).
4. **Gallery** lists tonight’s clips. **Settings** can force the Offline chip and mock battery %.

Add to Home Screen from the tablet browser for a PWA-like standalone shell (`display: standalone` in the web manifest).

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
- Guest QR (current origin + `/s/[clipId]`) via `qrcode.react`
- Copy link, `sms:` “Text me”, download when a blob or demo file exists
- **Live time-ramp playback**: `playbackRate` keyframes (normal → slow-mo → freeze) in `RampPlayer`
- Event frames overlaid on preview (gold oval, neon ring, midnight arch, classic plaque, minimal)
- Force-offline chip, mock battery, Camera OK / demo status

**Simulated / stubbed (extension points)**

- **Platform motor** — `src/lib/hardware/motor.ts` (`createStubMotor`). Swap in serial / BLE / USB without changing capture orchestration.
- **GoPro** — `src/lib/hardware/gopro.ts`. Unused on the live path; capture uses the tablet/USB camera.
- **Baked slow-mo file** — the ramp is live in the player, **not** re-encoded into the downloaded MP4/WebM.
- **Cloud gallery / guest phones** — `/s/[clipId]` reads IndexedDB on *this* tablet. A guest phone scanning the QR will not have the blob unless you deploy a public origin and upload clips. Production needs a hosted URL.
- **Music bed** — stored as a label only (no audio mix).
- **TV mirror / AI frames** — not built.

## Stack

- Next.js 15 App Router, React 19, TypeScript, Tailwind CSS v4
- Client-heavy UI, local-first (`IndexedDB`)
- `lucide-react` icons, `qrcode.react` QR codes

## Capture pipeline

`START SPIN` → 3-2-1 countdown (camera or demo preview) → timed record via `MediaRecorder` → save clip + blob → gallery / share.

Hardware calls sit beside that: `motor.spin(durationMs)` is invoked during record so a future motor implementation can run in lockstep.

## Design

Dark charcoal (`#05080f` / `#0a101c`), white type, electric blue (`#3B82F6`), green Camera OK. Large touch targets, landscape and portrait. Event name stays on Capture and Share.

## Future

- GoPro Open GoPro / USB webcam ingest
- Real platform motor (ESP32 / GRBL / vendor SDK)
- Cloud clip hosting so guest phones can scan at the venue
- Server-side re-encode of the time-ramp + music bed
- AI / custom frame builder
- HDMI / TV mirror for the crowd display
