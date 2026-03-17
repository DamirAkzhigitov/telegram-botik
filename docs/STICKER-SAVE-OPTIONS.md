# Options for Saving Generated Sticker in Telegram Web App

## Problem

In Telegram's in-app WebView (mobile), the standard download flow fails:

- **Blob URL** (`blob:https://...`) – Long-press context menu shows "Download" and "Open in", but neither works
- **Programmatic `<a download>` click** – No effect in WebView
- **Web Share API** – May work on some devices, unreliable in Telegram WebView

The WebView cannot access blob URLs outside its memory context, so Android's DownloadManager receives an invalid reference.

---

## Option 1: Send via Telegram Bot (Recommended)

**How it works:** Use the Bot API to send the generated image as a document to the user's Telegram chat. The user receives it in their chat with the bot and can tap to download (native Telegram flow).

**Pros:**

- Works reliably on all platforms
- Uses Telegram's native download (no WebView limitations)
- User gets the file in their chat history

**Cons:**

- Requires backend: new API endpoint
- User must have started a chat with the bot (we have `userId` from initData = chat_id for private chats)

**Implementation:**

1. Add `POST /api/send-sticker-to-user` – accepts image blob + initData
2. Validate initData, extract `userId` (chat_id for private chat)
3. Call `https://api.telegram.org/bot{token}/sendDocument` with `chat_id: userId`

---

## Option 2: Temporary Download URL + Open in External Browser

**How it works:** Store the image temporarily under a real HTTPS URL. User taps "Open in browser" → `Telegram.WebApp.openLink(url)` opens it in the system browser. There, long-press → Save works.

**Pros:**

- Uses real URL, so external browser can download
- No need to send to chat

**Cons:**

- Requires temporary storage (KV, R2, or Cache API)
- Token management and expiry
- Extra step for user (open in browser, then save)

**Implementation:**

1. After generation, store image in KV: `sticker_{uuid}` → base64 or binary
2. Return URL: `https://your-worker.workers.dev/api/download-sticker/{uuid}`
3. Add `GET /api/download-sticker/:id` – returns image, optionally deletes after first fetch
4. Button: `Telegram.WebApp.openLink(downloadUrl)` instead of download

---

## Option 3: Data URL Instead of Blob URL

**How it works:** Use `data:image/png;base64,...` for the `<img src>` instead of `blob:...`. Some WebViews handle data URLs differently in the context menu.

**Pros:**

- Simple change, no backend
- Might improve behavior in some WebViews

**Cons:**

- Large images → very long URLs (possible size limits)
- Unlikely to fix Telegram WebView; blob vs data often behaves the same there

---

## Option 4: Web Share API (Current Fallback)

**How it works:** `navigator.share({ files: [file] })` opens the native share sheet. User can choose "Save to Photos" or similar.

**Pros:**

- No backend changes
- Works on many mobile browsers

**Cons:**

- Not supported or unreliable in Telegram WebView
- User may need to pick an app to save

---

## Option 5: Copy to Clipboard (Limited Use)

**How it works:** Copy the image to clipboard via `navigator.clipboard.write()` (Clipboard API with `ClipboardItem`).

**Pros:**

- No backend
- Some WebViews support it

**Cons:**

- User must paste elsewhere to save
- Clipboard API support in WebView is inconsistent

---

## Recommendation

**Option 1 (Send via Telegram)** is the most reliable for Telegram Web App users. It reuses the existing auth (initData) and Bot API, and the user gets the file in their chat with the bot.

**Option 2 (Temporary URL)** is a good alternative if you prefer not to send files into the chat.

I can implement Option 1 (send via bot) or Option 2 (temporary URL) next—say which you prefer.
