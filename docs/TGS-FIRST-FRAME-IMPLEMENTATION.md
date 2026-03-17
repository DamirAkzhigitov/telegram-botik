# TGS First-Frame Extraction – Future Implementation

This document outlines options for extracting the first frame of a TGS (Telegram animated sticker) as a raster image, enabling support for animated stickers in the sticker generation flow.

## Background

- **TGS format**: Gzipped Lottie JSON (vector animation)
- **Current limitation**: Only static image stickers (WebP, PNG, JPG) are supported for generation
- **Goal**: Allow TGS stickers by rendering frame 0 to a bitmap and passing it to the OpenAI image generation API

## Options for Implementation

### 1. Client-Side Rendering (Recommended for Cloudflare Workers)

Render the first frame in the browser and send the resulting image to the API.

**Approach:**

- Use `lottie-web` or a similar library that supports frame-by-frame rendering
- Load the TGS (decompress with pako, then parse Lottie JSON)
- Render frame 0 to a `<canvas>`
- Export via `canvas.toDataURL('image/png')` or `canvas.toBlob()`
- Send the image to `/api/generate-sticker` (e.g. as `stickerImage` instead of `stickerFileId` when the sticker is TGS)

**Pros:**

- No server-side graphics dependencies
- Works within Cloudflare Workers constraints
- Reuses existing client-side TGS handling (e.g. `dotlottie-wc`, `pako`)

**Cons:**

- Requires client-side library capable of rendering to canvas
- Slightly more client logic and payload size

**Libraries to evaluate:**

- `lottie-web` – `renderer: 'canvas'`, `rendererSettings` for frame control
- `@lottiefiles/dotlottie-react` / `dotlottie-js` – check for canvas export APIs

---

### 2. External Service

Use a third-party API to convert Lottie/TGS to images.

**Approach:**

- Call an external service (e.g. LottieFiles, or a custom microservice) with the TGS URL or bytes
- Receive a first-frame image (PNG/JPEG)
- Pass that image to the OpenAI API

**Pros:**

- Keeps Worker logic simple
- No client changes if the service is called server-side

**Cons:**

- External dependency and possible cost
- Latency and availability concerns

---

### 3. Server-Side Rendering (Non-Worker Backend)

Render on a Node.js server with canvas support.

**Approach:**

- Use `lottie-node` (or similar) with `canvas` to render frame 0
- Run this in a Node.js environment (Vercel, Railway, VPS, etc.)
- Worker or client calls this service to get the first-frame image

**Pros:**

- Mature tooling and control over rendering

**Cons:**

- Requires a separate backend; not suitable for Workers
- More infrastructure to maintain

---

### 4. WebAssembly in Workers

Use a Lottie renderer compiled to WASM that runs in Workers.

**Approach:**

- Find or build a WASM-based Lottie renderer (e.g. `rlottie-wasm` or similar)
- Load and run it in the Worker
- Render frame 0 and output a bitmap

**Pros:**

- Could keep everything in the Worker

**Cons:**

- Needs research for compatible libraries
- WASM size and cold-start impact
- May require Workers-specific compatibility checks

---

## Recommended Path

**Primary:** Implement **Option 1 (Client-Side Rendering)**:

1. Add a client-side step: when the user selects a TGS sticker, fetch the TGS blob and render frame 0 to a canvas.
2. Extend the API to accept either:
   - `stickerFileId` (for static stickers, fetched server-side from Telegram), or
   - `stickerImage` (File/Blob for TGS first-frame, sent from the client).
3. Update the UI to show a “Rendering…” state for TGS stickers before enabling Generate.

**Fallback:** If client-side rendering is too heavy or unreliable, consider **Option 2 (External Service)** for a dedicated TGS-to-image conversion endpoint.

---

## Technical Notes

- TGS decompression: `pako.ungzip(bytes, { to: 'string' })` → Lottie JSON
- Lottie frame 0 is typically at `t: 0` in the animation timeline
- Canvas export: `canvas.toBlob(cb, 'image/png')` for FormData upload
- Sticker file fetch: reuse `/api/sticker-file?file_id=xxx` to get TGS bytes on the client

---

## References

- [Lottie Web](https://github.com/airbnb/lottie-web)
- [Telegram Sticker Format (TGS)](https://core.telegram.org/stickers#animated-stickers)
- [Lottie JSON format](https://lottiefiles.github.io/lottie-docs/)
