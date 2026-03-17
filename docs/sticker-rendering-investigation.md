# Sticker Rendering Investigation

Document for future debugging of sticker display issues in the admin panel.

## Context

The admin panel (`/admin`) displays sticker thumbnails from Telegram sticker packs. Stickers are fetched via `/api/sticker-file?file_id=...` which proxies files from the Telegram Bot API.

## Sticker Formats (Telegram Bot API)

| Format | Extension | Content-Type | Renders in `<img>` |
|--------|-----------|--------------|-------------------|
| Static | `.webp` | `image/webp` | Yes |
| Animated | `.tgs` | `application/x-tgsticker` | No (Lottie) |
| Video | `.webm` | `video/webm` | No |

Sticker sets can contain a mix of formats. The file format is determined by the `file_path` returned from `getFile` (e.g. `stickers/file_123.webp`).

## Issues Encountered

### 1. Wrong Content-Type in Response

**Symptom:** Response headers showed `content-type: application/octet-stream` instead of `image/webp`.

**Impact:** `res.blob()` produces a Blob with wrong type; `readAsDataURL(blob)` yields `data:application/octet-stream;base64,...`, which may not render correctly in `<img>`.

### 2. Base64 Preview Fails Completely

**Symptom:** Pasting the base64 into an online preview tool does not render at all.

**Root causes:**
- **Animated/video stickers:** Client was forcing `type: 'image/webp'` on all blobs. For TGS/WebM files, this created invalid data URLs—the bytes are not WebP, so preview fails.
- **Streaming:** Passing `fileRes.body` (ReadableStream) through the Worker response may have caused data corruption in some environments.

## Fixes Applied

### Server (`src/api/stickers.ts`)

- Use `arrayBuffer()` instead of streaming the response body.
- Infer `Content-Type` from `file_path` extension:
  - `.webp` → `image/webp`
  - `.tgs` → `application/x-tgsticker`
  - `.webm` → `video/webm`
- Add `X-Sticker-Format` header for debugging.
- Add `X-Content-Type-Options: nosniff`.

### Client (`src/index.ts` – `StickerThumbnail`)

- Only render as image when `blob.type === 'image/webp'`.
- For TGS/WebM, show placeholder (🎬) instead of attempting image render.
- Do not force `image/webp` on non-WebP blobs.

## Debugging Tips

1. **Check response headers** for `/api/sticker-file`:
   - `Content-Type` should match file format.
   - `X-Sticker-Format` shows inferred extension.

2. **Verify file format:** Call `getFile` for a sticker’s `file_id` and inspect `file_path` extension.

3. **Base64 preview:** If it fails, the data may be:
   - TGS/WebM (not WebP),
   - Corrupted (try reverting to `arrayBuffer` if streaming was used),
   - Or the wrong MIME type was used when creating the data URL.

4. **Cloudflare Workers:** If `Content-Type` is overridden to `application/octet-stream`, try:
   - Explicit `new Headers()` object.
   - `X-Content-Type-Options: nosniff`.

## References

- [Telegram Bot API – Stickers](https://core.telegram.org/bots/api#sticker)
- [Telegram Bot API – getFile](https://core.telegram.org/bots/api#getfile)
- [Sticker formats (WebP, TGS, WebM)](https://core.telegram.org/api/stickers)
