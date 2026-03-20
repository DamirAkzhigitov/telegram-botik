import { createBot } from './bot/createBot'
import {
  getSessions,
  getSession,
  getAdminChats,
  patchSession
} from './api/sessions'
import { getStickerPacks, getStickers, getStickerFile } from './api/stickers'
import { generateSticker } from './api/generateSticker'
import { sendStickerToUser } from './api/sendStickerToUser'
import { runProactiveCronTick } from './cron/proactiveRevival'
import type { Update } from 'telegraf/types'

export default {
  async fetch(
    request: Request,
    env: Env,
    executionCtx?: ExecutionContext
  ): Promise<Response> {
    return handleUpdate(request, env, executionCtx)
  },

  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    await runProactiveCronTick(env)
  }
}

async function handleUpdate(
  request: Request,
  env: Env,
  executionCtx?: ExecutionContext
) {
  const url = new URL(request.url)
  const pathname = url.pathname

  // PATCH for admin session updates
  if (request.method === 'PATCH') {
    if (pathname.startsWith('/api/')) {
      return handleApiRequest(request, env, pathname)
    }
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Handle POST requests for API (e.g. generate-sticker) and Telegram webhooks
  if (request.method === 'POST') {
    if (pathname.startsWith('/api/')) {
      return handleApiRequest(request, env, pathname)
    }
    try {
      const bot = createBot(env, false, executionCtx)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const update = (await request.json()) as Update
      await bot.handleUpdate(update)

      return new Response('OK')
    } catch (e) {
      console.error('POST webhook handler error', e)
      return new Response('Invalid request', { status: 400 })
    }
  }

  // Handle GET requests for admin panel and API
  if (request.method === 'GET') {
    // API endpoints
    if (pathname.startsWith('/api/')) {
      return handleApiRequest(request, env, pathname)
    }

    // Admin panel route
    if (pathname === '/admin' || pathname === '/admin/') {
      return serveAdminPanel(request, env)
    }

    // Health check or root
    if (pathname === '/' || pathname === '/health') {
      return new Response('OK', { status: 200 })
    }

    // If path looks like a webhook endpoint, return 405 for non-POST
    if (pathname === '/webhook' || pathname.startsWith('/webhook/')) {
      return new Response('Method Not Allowed', { status: 405 })
    }

    return new Response('Not Found', { status: 404 })
  }

  // For all other methods, check if it's a webhook path
  if (pathname === '/webhook' || pathname.startsWith('/webhook/')) {
    return new Response('Method Not Allowed', { status: 405 })
  }

  return new Response('Method Not Allowed', { status: 405 })
}

async function handleApiRequest(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  const sessionDetailMatch = pathname.match(/^\/api\/sessions\/(.+)$/)
  if (sessionDetailMatch) {
    const chatId = sessionDetailMatch[1]
    if (request.method === 'GET') {
      return getSession(request, env, chatId)
    }
    if (request.method === 'PATCH') {
      return patchSession(request, env, chatId)
    }
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  // GET /api/sessions - List all sessions for admin chats
  if (pathname === '/api/sessions') {
    return getSessions(request, env)
  }

  // GET /api/admin/chats - List admin chats
  if (pathname === '/api/admin/chats') {
    return getAdminChats(request, env)
  }

  // GET /api/sticker-packs - List sticker pack names
  if (pathname === '/api/sticker-packs') {
    return getStickerPacks(request, env)
  }

  // GET /api/stickers?pack=name - Get stickers from a pack
  if (pathname === '/api/stickers') {
    return getStickers(request, env)
  }

  // GET /api/sticker-file?file_id=xxx - Proxy sticker image
  if (pathname === '/api/sticker-file') {
    return getStickerFile(request, env)
  }

  // POST /api/generate-sticker - Generate sticker from actor image + reference sticker
  if (pathname === '/api/generate-sticker') {
    return generateSticker(request, env)
  }

  // POST /api/send-sticker-to-user - Send generated sticker to user's Telegram chat
  if (pathname === '/api/send-sticker-to-user') {
    return sendStickerToUser(request, env)
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  })
}

function serveAdminPanel(_request: Request, _env: Env): Response {
  // For now, return a simple HTML that will load the React app
  // In production, this should serve from static assets
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin Panel</title>
  <script src="https://telegram.org/js/telegram-web-app.js"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/pako@2.1.0/dist/pako.min.js"></script>
  <script type="module" src="https://unpkg.com/@lottiefiles/dotlottie-wc@0.7.1/dist/dotlottie-wc.js"></script>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: var(--tg-theme-bg-color, #ffffff);
      color: var(--tg-theme-text-color, #000000);
      padding: 16px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    .loading {
      text-align: center;
      padding: 40px;
      color: var(--tg-theme-hint-color, #999999);
    }
    .error {
      background: var(--tg-theme-destructive-text-color, #ff3b30);
      color: white;
      padding: 12px;
      border-radius: 8px;
      margin: 16px 0;
    }
    .session-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .session-item {
      background: var(--tg-theme-secondary-bg-color, #f1f1f1);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .session-item:active {
      transform: scale(0.98);
    }
    .session-item h3 {
      margin-bottom: 8px;
      font-size: 16px;
    }
    .session-item p {
      font-size: 14px;
      color: var(--tg-theme-hint-color, #999999);
      margin: 4px 0;
    }
    .session-detail {
      background: var(--tg-theme-secondary-bg-color, #f1f1f1);
      border-radius: 12px;
      padding: 16px;
      margin-top: 16px;
    }
    .session-detail h2 {
      margin-bottom: 16px;
      font-size: 18px;
    }
    .detail-item {
      margin: 12px 0;
      padding: 12px;
      background: var(--tg-theme-bg-color, #ffffff);
      border-radius: 8px;
    }
    .detail-item label {
      font-weight: 600;
      font-size: 12px;
      text-transform: uppercase;
      color: var(--tg-theme-hint-color, #999999);
      display: block;
      margin-bottom: 4px;
    }
    .detail-item value {
      font-size: 14px;
      display: block;
      word-break: break-word;
    }
    .detail-item input[type="text"],
    .detail-item textarea {
      width: 100%;
      box-sizing: border-box;
      font-size: 14px;
      padding: 8px 10px;
      border-radius: 6px;
      border: 1px solid var(--tg-theme-hint-color, #cccccc);
      background: var(--tg-theme-bg-color, #ffffff);
      color: var(--tg-theme-text-color, #000000);
    }
    .detail-item textarea {
      min-height: 80px;
      font-family: ui-monospace, monospace;
      resize: vertical;
    }
    .detail-item input[type="checkbox"] {
      width: 18px;
      height: 18px;
      margin-right: 8px;
      vertical-align: middle;
    }
    .session-edit-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 12px;
    }
    .session-edit-toolbar button {
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
    }
    .session-edit-toolbar .edit-btn {
      background: var(--tg-theme-button-color, #3390ec);
      color: var(--tg-theme-button-text-color, #ffffff);
    }
    .session-edit-toolbar .save-btn {
      background: #2d9f5e;
      color: #ffffff;
    }
    .session-edit-toolbar .cancel-btn {
      background: var(--tg-theme-secondary-bg-color, #e8e8e8);
      color: var(--tg-theme-text-color, #000000);
    }
    .session-edit-toolbar button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .back-button {
      background: var(--tg-theme-button-color, #3390ec);
      color: var(--tg-theme-button-text-color, #ffffff);
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 16px;
      cursor: pointer;
      margin-bottom: 16px;
    }
    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--tg-theme-hint-color, #999999);
    }
    .tabs {
      display: flex;
      gap: 4px;
      margin-bottom: 20px;
      border-bottom: 1px solid var(--tg-theme-hint-color, #e0e0e0);
      padding-bottom: 12px;
    }
    .tab {
      flex: 1;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      background: var(--tg-theme-secondary-bg-color, #f1f1f1);
      color: var(--tg-theme-text-color, #000000);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: background 0.2s;
    }
    .tab:hover {
      background: var(--tg-theme-hint-color, #e0e0e0);
    }
    .tab.active {
      background: var(--tg-theme-button-color, #3390ec);
      color: var(--tg-theme-button-text-color, #ffffff);
    }
    .welcome-screen {
      text-align: center;
      padding: 40px 20px;
    }
    .welcome-screen h1 {
      font-size: 24px;
      margin-bottom: 12px;
    }
    .welcome-screen p {
      color: var(--tg-theme-hint-color, #999999);
      font-size: 16px;
      line-height: 1.5;
    }
    .stickers-placeholder {
      text-align: center;
      padding: 40px 20px;
      color: var(--tg-theme-hint-color, #999999);
    }
    .stickers-placeholder h2 {
      font-size: 18px;
      margin-bottom: 12px;
      color: var(--tg-theme-text-color, #000000);
    }
    .stickers-section {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    .stickers-section h2 {
      font-size: 18px;
      margin-bottom: 4px;
    }
    .image-upload {
      border: 2px dashed var(--tg-theme-hint-color, #ccc);
      border-radius: 12px;
      padding: 24px;
      text-align: center;
      cursor: pointer;
      background: var(--tg-theme-secondary-bg-color, #f8f8f8);
      min-height: 120px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .image-upload:hover {
      border-color: var(--tg-theme-button-color, #3390ec);
      background: var(--tg-theme-secondary-bg-color, #f0f0f0);
    }
    .image-upload input {
      display: none;
    }
    .image-upload.has-image {
      padding: 8px;
      min-height: auto;
    }
    .image-preview {
      max-width: 100%;
      max-height: 200px;
      border-radius: 8px;
      object-fit: contain;
    }
    .sticker-pack-select {
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--tg-theme-hint-color, #e0e0e0);
      background: var(--tg-theme-bg-color, #fff);
      color: var(--tg-theme-text-color, #000);
      font-size: 14px;
      width: 100%;
    }
    .custom-pack-row {
      margin-top: 8px;
    }
    .custom-pack-input {
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid var(--tg-theme-hint-color, #e0e0e0);
      background: var(--tg-theme-bg-color, #fff);
      color: var(--tg-theme-text-color, #000);
      font-size: 14px;
      width: 100%;
      box-sizing: border-box;
    }
    .custom-pack-input::placeholder {
      color: var(--tg-theme-hint-color, #999);
    }
    .sticker-mode-toggle {
      display: flex;
      gap: 12px;
      margin-bottom: 8px;
    }
    .sticker-mode-toggle .mode-option {
      flex: 1;
      padding: 10px 14px;
      border-radius: 8px;
      border: 2px solid var(--tg-theme-hint-color, #e0e0e0);
      background: var(--tg-theme-secondary-bg-color, #f8f8f8);
      cursor: pointer;
      text-align: center;
      font-size: 14px;
    }
    .sticker-mode-toggle .mode-option.active {
      border-color: var(--tg-theme-button-color, #3390ec);
      background: rgba(51, 144, 236, 0.1);
    }
    .sticker-mode-toggle .mode-option.disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .sticker-mode-toggle .mode-option input {
      display: none;
    }
    .send-telegram-btn {
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      background: var(--tg-theme-button-color, #3390ec);
      color: var(--tg-theme-button-text-color, #fff);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
    }
    .send-telegram-btn:hover:not(:disabled) {
      opacity: 0.9;
    }
    .send-telegram-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .send-success {
      color: var(--tg-theme-button-color, #3390ec);
    }
    .sticker-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 8px;
      max-height: 200px;
      overflow-y: auto;
    }
    .sticker-item {
      aspect-ratio: 1;
      padding: 4px;
      border-radius: 8px;
      cursor: pointer;
      border: 2px solid transparent;
      background: var(--tg-theme-secondary-bg-color, #f1f1f1);
    }
    .sticker-item:hover {
      border-color: var(--tg-theme-hint-color, #ccc);
    }
    .sticker-item.selected {
      border-color: var(--tg-theme-button-color, #3390ec);
      background: rgba(51, 144, 236, 0.1);
    }
    .sticker-item img,
    .sticker-item video {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .sticker-item .sticker-loading {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      color: var(--tg-theme-hint-color, #999);
    }
    .sticker-lottie-wrap {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .sticker-lottie-wrap dotlottie-wc {
      width: 100%;
      height: 100%;
    }
    .generate-btn {
      background: var(--tg-theme-button-color, #3390ec);
      color: var(--tg-theme-button-text-color, #ffffff);
      border: none;
      border-radius: 12px;
      padding: 14px 24px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
    }
    .generate-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .generate-btn:not(:disabled):active {
      transform: scale(0.98);
    }
    .debug-panel {
      margin-top: 16px;
      padding: 12px;
      background: var(--tg-theme-secondary-bg-color, #f0f0f0);
      border-radius: 8px;
      font-size: 12px;
      font-family: monospace;
      color: var(--tg-theme-hint-color, #666);
      white-space: pre-wrap;
      word-break: break-all;
    }
    .debug-panel summary {
      cursor: pointer;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .dev-banner {
      background: #f59e0b;
      color: #000;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading">Loading...</div>
  </div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    const TABS = { welcome: 'welcome', admin: 'admin', stickers: 'stickers' };

    function StickerThumbnail({ fileId, authParam, onError }) {
      const [src, setSrc] = React.useState(null);
      const [lottieUrl, setLottieUrl] = React.useState(null);
      const [videoUrl, setVideoUrl] = React.useState(null);
      const [error, setError] = React.useState(false);
      const lottieUrlRef = React.useRef(null);
      const videoUrlRef = React.useRef(null);
      const baseUrl = window.location.origin;
      useEffect(() => {
        setSrc(null);
        setLottieUrl(prev => { if (prev) { URL.revokeObjectURL(prev); } return null; });
        setVideoUrl(prev => { if (prev) { URL.revokeObjectURL(prev); } return null; });
        if (lottieUrlRef.current) { URL.revokeObjectURL(lottieUrlRef.current); lottieUrlRef.current = null; }
        if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null; }
        setError(false);
        const url = \`\${baseUrl}/api/sticker-file?file_id=\${encodeURIComponent(fileId)}\${authParam}\`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        fetch(url, { signal: controller.signal })
          .then(res => {
            clearTimeout(timeout);
            if (!res.ok) {
              return res.text().then(t => { throw new Error(\`HTTP \${res.status}: \${t || res.statusText}\`); });
            }
            return res.blob();
          })
          .then(blob => {
            if (blob.type === 'image/webp') {
              const reader = new FileReader();
              reader.onloadend = () => setSrc(reader.result);
              reader.readAsDataURL(blob);
            } else {
              blob.arrayBuffer().then(buf => {
                const bytes = new Uint8Array(buf);
                const isWebP = bytes.length >= 4 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
                const isTgs = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
                const pakoLib = (typeof pako !== 'undefined' ? pako : null) || (typeof window !== 'undefined' && window.pako);
                if (isWebP) {
                  const webpBlob = new Blob([buf], { type: 'image/webp' });
                  const reader = new FileReader();
                  reader.onloadend = () => setSrc(reader.result);
                  reader.readAsDataURL(webpBlob);
                } else if (isTgs && pakoLib && pakoLib.ungzip) {
                  try {
                    const jsonStr = pakoLib.ungzip(bytes, { to: 'string' });
                    if (jsonStr && jsonStr.trim().startsWith('{')) {
                      const lurl = URL.createObjectURL(new Blob([jsonStr], { type: 'application/json' }));
                      lottieUrlRef.current = lurl;
                      setLottieUrl(lurl);
                    } else {
                      setError(true);
                    }
                  } catch (e) {
                    setError(true);
                    onError?.('TGS decompress failed');
                  }
                } else if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
                  const vurl = URL.createObjectURL(new Blob([buf], { type: 'video/webm' }));
                  videoUrlRef.current = vurl;
                  setVideoUrl(vurl);
                } else {
                  setError(true);
                }
              });
            }
          })
          .catch(err => {
            clearTimeout(timeout);
            setError(true);
            const msg = err.name === 'AbortError' ? 'Timeout' : (err.message || String(err));
            onError?.(msg);
            const tg = window.Telegram?.WebApp;
            if (tg?.showAlert) tg.showAlert('Sticker load failed: ' + msg);
          });
        return () => {
          if (lottieUrlRef.current) { URL.revokeObjectURL(lottieUrlRef.current); lottieUrlRef.current = null; }
          if (videoUrlRef.current) { URL.revokeObjectURL(videoUrlRef.current); videoUrlRef.current = null; }
        };
      }, [fileId]);
      if (error) return <div className="sticker-loading">?</div>;
      if (lottieUrl) {
        return (
          <div className="sticker-lottie-wrap">
            <dotlottie-wc
              src={lottieUrl}
              loop
              autoplay
              mode="forward"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
        );
      }
      if (videoUrl) {
        return (
          <video src={videoUrl} loop muted autoPlay playsInline />
        );
      }
      if (!src) return <div className="sticker-loading">...</div>;
      return <img src={src} alt="" />;
    }

    function App() {
      const [activeTab, setActiveTab] = React.useState(TABS.welcome);
      const [sessions, setSessions] = React.useState([]);
      const [selectedSession, setSelectedSession] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [sessionsLoading, setSessionsLoading] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [selectedImage, setSelectedImage] = React.useState(null);
      const [selectedImageFile, setSelectedImageFile] = React.useState(null);
      const [selectedSticker, setSelectedSticker] = React.useState(null);
      const [generateLoading, setGenerateLoading] = React.useState(false);
      const [generatedImage, setGeneratedImage] = React.useState(null);
      const [generatedImageBlob, setGeneratedImageBlob] = React.useState(null);
      const [sendToTelegramLoading, setSendToTelegramLoading] = React.useState(false);
      const [sendToTelegramMessage, setSendToTelegramMessage] = React.useState(null);
      const [generateError, setGenerateError] = React.useState(null);
      const [stickerPacks, setStickerPacks] = React.useState([]);
      const [stickers, setStickers] = React.useState([]);
      const [selectedPack, setSelectedPack] = React.useState('');
      const [customPackInput, setCustomPackInput] = React.useState('');
      const [stickersLoading, setStickersLoading] = React.useState(false);
      const [stickerDebug, setStickerDebug] = React.useState({ packs: null, stickers: null, imageErrors: [] });
      const [stickerInputMode, setStickerInputMode] = React.useState('upload');
      const [stickerImageFile, setStickerImageFile] = React.useState(null);
      const [stickerImagePreview, setStickerImagePreview] = React.useState(null);
      const [sessionEditing, setSessionEditing] = React.useState(false);
      const [sessionDraft, setSessionDraft] = React.useState(null);
      const [sessionSaveLoading, setSessionSaveLoading] = React.useState(false);
      const [sessionSaveError, setSessionSaveError] = React.useState(null);

      const isDevMode = () => {
        const host = window.location.hostname || '';
        const devParam = new URL(window.location.href).searchParams.get('dev');
        return host === 'localhost' || host === '127.0.0.1' || devParam === '1';
      };

      useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg && !isDevMode()) {
          setError('Telegram Web App not available. Please open this app from Telegram.');
          setLoading(false);
          return;
        }
        if (tg) {
          tg.ready();
          tg.expand();
        }
        const initData = tg?.initData || '';
        if (!initData && !isDevMode()) {
          setError('Authentication required. Please open this app from Telegram.');
          setLoading(false);
          return;
        }
        setLoading(false);
      }, []);

      useEffect(() => {
        if (activeTab !== TABS.admin) return;
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        if (!initData && !isDevMode()) return;
        loadSessions(isDevMode() ? null : initData);
      }, [activeTab]);

      useEffect(() => {
        if (activeTab !== TABS.stickers) return;
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        if (!initData && !isDevMode()) return;
        const baseUrl = window.location.origin;
        const auth = isDevMode() ? 'dev=1' : \`_auth=\${encodeURIComponent(initData)}\`;
        fetch(\`\${baseUrl}/api/sticker-packs?\${auth}\`)
          .then(res => res.ok ? res.json() : res.text().then(t => Promise.reject(new Error(\`\${res.status}: \${t}\`))))
          .then(data => {
            setStickerPacks(data.packs || []);
            setStickerDebug(d => ({ ...d, packs: 'ok: ' + (data.packs?.length || 0) + ' packs' }));
            if (data.packs?.length > 0 && !selectedPack) {
              setSelectedPack(data.packs[0]);
            }
          })
          .catch(err => {
            setStickerPacks([]);
            setStickerDebug(d => ({ ...d, packs: 'err: ' + (err.message || err) }));
          });
      }, [activeTab]);

      const packToFetch = (customPackInput.trim() || selectedPack);
      useEffect(() => {
        if (!packToFetch) return;
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        if (!initData && !isDevMode()) return;
        setStickersLoading(true);
        setStickerDebug(d => ({ ...d, imageErrors: [] }));
        const baseUrl = window.location.origin;
        const auth = isDevMode() ? 'dev=1' : \`_auth=\${encodeURIComponent(initData)}\`;
        fetch(\`\${baseUrl}/api/stickers?pack=\${encodeURIComponent(packToFetch)}&\${auth}\`)
          .then(res => res.ok ? res.json() : res.text().then(t => Promise.reject(new Error(\`\${res.status}: \${t}\`))))
          .then(data => {
            setStickers(data.stickers || []);
            setSelectedSticker(null);
            setStickerDebug(d => ({ ...d, stickers: 'ok: ' + (data.stickers?.length || 0) + ' stickers' }));
          })
          .catch(err => {
            setStickers([]);
            setStickerDebug(d => ({ ...d, stickers: 'err: ' + (err.message || err) }));
          })
          .finally(() => setStickersLoading(false));
      }, [packToFetch]);

      useEffect(() => {
        setSessionEditing(false);
        setSessionDraft(null);
        setSessionSaveError(null);
      }, [selectedSession?.chatId]);

      function loadSessions(auth) {
        setSessionsLoading(true);
        const baseUrl = window.location.origin;
        const authParam = auth === null ? 'dev=1' : \`_auth=\${encodeURIComponent(auth)}\`;
        const url = \`\${baseUrl}/api/sessions?\${authParam}\`;
        
        fetch(url)
          .then(res => {
            if (!res.ok) {
              if (res.status === 401) {
                throw new Error('Unauthorized - Please open this app from Telegram');
              }
              throw new Error(\`HTTP \${res.status}\`);
            }
            return res.json();
          })
          .then(data => {
            setSessions(data.sessions || []);
            setSessionsLoading(false);
          })
          .catch(err => {
            console.error('Error loading sessions:', err);
            setError(err.message);
            setSessionsLoading(false);
          });
      }

      function loadSessionDetail(chatId) {
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        if (!initData && !isDevMode()) {
          setError('Authentication required');
          return;
        }
        const baseUrl = window.location.origin;
        const authParam =
          isDevMode() && !initData
            ? 'dev=1'
            : \`_auth=\${encodeURIComponent(initData)}\`;
        const url = \`\${baseUrl}/api/sessions/\${chatId}?\${authParam}\`;
        fetch(url)
          .then(res => {
            if (!res.ok) throw new Error(\`HTTP \${res.status}\`);
            return res.json();
          })
          .then(data => {
            setSelectedSession(data);
          })
          .catch(err => {
            console.error('Error loading session detail:', err);
            setError(err.message);
          });
      }

      function beginSessionEdit() {
        const s = selectedSession?.session;
        if (!s) return;
        const cs = s.chat_settings ?? {};
        setSessionDraft({
          model: s.model != null ? String(s.model) : 'not_set',
          prompt: s.prompt ?? '',
          stickersPacksStr: (s.stickersPacks || []).join(', '),
          toggle_history: Boolean(s.toggle_history),
          firstTime: Boolean(s.firstTime),
          promptNotSet: Boolean(s.promptNotSet),
          stickerNotSet: Boolean(s.stickerNotSet),
          mood_text: typeof cs.mood_text === 'string' ? cs.mood_text : '',
          directed_reply_gating: Boolean(cs.directed_reply_gating),
          proactive_enabled: Boolean(cs.proactive_enabled),
          proactive_stale_hours:
            cs.proactive_stale_hours != null && cs.proactive_stale_hours !== ''
              ? String(cs.proactive_stale_hours)
              : '',
          chat_settings_json: JSON.stringify(cs, null, 2),
          memories_json: JSON.stringify(s.memories ?? [], null, 2)
        });
        setSessionEditing(true);
        setSessionSaveError(null);
      }

      function cancelSessionEdit() {
        setSessionEditing(false);
        setSessionDraft(null);
        setSessionSaveError(null);
      }

      async function saveSessionEdit() {
        if (!selectedSession || !sessionDraft) return;
        let chat_settings;
        let memories;
        try {
          chat_settings = JSON.parse(sessionDraft.chat_settings_json);
        } catch {
          setSessionSaveError('Chat settings: invalid JSON');
          return;
        }
        try {
          memories = JSON.parse(sessionDraft.memories_json);
        } catch {
          setSessionSaveError('Memories: invalid JSON');
          return;
        }
        if (typeof chat_settings !== 'object' || chat_settings === null || Array.isArray(chat_settings)) {
          setSessionSaveError('Chat settings must be a JSON object');
          return;
        }
        const mt = (sessionDraft.mood_text || '').trim();
        if (mt.length > 0 && mt.length < 150) {
          setSessionSaveError('Mood text must be at least 150 characters (or leave empty to clear)');
          return;
        }
        if (/[A-Za-z]/.test(mt)) {
          setSessionSaveError('Mood text must be Russian only (no Latin letters)');
          return;
        }
        const psh = (sessionDraft.proactive_stale_hours || '').trim();
        if (psh !== '') {
          const n = Number(psh);
          if (!Number.isFinite(n) || n <= 0) {
            setSessionSaveError('Proactive stale hours must be a positive number');
            return;
          }
        }
        chat_settings = {
          ...chat_settings,
          directed_reply_gating: sessionDraft.directed_reply_gating,
          proactive_enabled: sessionDraft.proactive_enabled,
          mood_text: mt === '' ? '' : mt
        };
        if (psh !== '') {
          chat_settings.proactive_stale_hours = Number(psh);
        }
        if (!Array.isArray(memories)) {
          setSessionSaveError('Memories must be a JSON array');
          return;
        }
        const stickersPacks = sessionDraft.stickersPacksStr
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        if (!initData && !isDevMode()) {
          setSessionSaveError('Authentication required');
          return;
        }
        const baseUrl = window.location.origin;
        const authParam =
          isDevMode() && !initData
            ? 'dev=1'
            : \`_auth=\${encodeURIComponent(initData)}\`;
        const url = \`\${baseUrl}/api/sessions/\${selectedSession.chatId}?\${authParam}\`;
        const body = {
          model: sessionDraft.model.trim() || 'not_set',
          prompt: sessionDraft.prompt,
          stickersPacks,
          toggle_history: sessionDraft.toggle_history,
          firstTime: sessionDraft.firstTime,
          promptNotSet: sessionDraft.promptNotSet,
          stickerNotSet: sessionDraft.stickerNotSet,
          chat_settings,
          memories
        };
        setSessionSaveLoading(true);
        setSessionSaveError(null);
        try {
          const res = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || \`HTTP \${res.status}\`);
          }
          setSelectedSession(data);
          setSessionEditing(false);
          setSessionDraft(null);
          const tgAfter = window.Telegram?.WebApp;
          const idAfter = tgAfter?.initData || '';
          if (idAfter || isDevMode()) {
            loadSessions(isDevMode() ? null : idAfter);
          }
        } catch (err) {
          setSessionSaveError(err?.message || 'Save failed');
        } finally {
          setSessionSaveLoading(false);
        }
      }

      if (loading) {
        return <div className="loading">Loading...</div>;
      }

      if (error) {
        return <div className="error">{error}</div>;
      }

      function renderTabContent() {
        if (activeTab === TABS.welcome) {
          return (
            <div className="welcome-screen">
              <h1>Welcome</h1>
              <p>Use the tabs below to navigate between sections.</p>
            </div>
          );
        }

        if (activeTab === TABS.stickers) {
          const tg = window.Telegram?.WebApp;
          const initData = tg?.initData || '';
          const baseUrl = window.location.origin;
          const authParam = isDevMode() ? '&dev=1' : (initData ? \`&_auth=\${encodeURIComponent(initData)}\` : '');
          const useUploadMode = stickerInputMode === 'upload';
          const canGenerate = useUploadMode
            ? (selectedImageFile && stickerImageFile && !generateLoading)
            : (selectedImageFile && selectedSticker && !generateLoading);
          return (
            <div className="stickers-section">
              <h2>1. First image (actor)</h2>
              <label className={\`image-upload \${selectedImage ? 'has-image' : ''}\`}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedImage(URL.createObjectURL(file));
                      setSelectedImageFile(file);
                      setGeneratedImage(null);
                      setGeneratedImageBlob(null);
                      setGenerateError(null);
                    }
                  }}
                />
                {selectedImage ? (
                  <img src={selectedImage} alt="Preview" className="image-preview" />
                ) : (
                  <>
                    <span>📷 Take a photo or choose from gallery</span>
                  </>
                )}
              </label>
              <h2>2. Reference (sticker or image)</h2>
              <div className="sticker-mode-toggle">
                <label className={\`mode-option \${useUploadMode ? 'active' : ''}\`}>
                  <input
                    type="radio"
                    name="stickerMode"
                    checked={useUploadMode}
                    onChange={() => {
                      setStickerInputMode('upload');
                      setSelectedSticker(null);
                      setGeneratedImage(null);
                      setGeneratedImageBlob(null);
                      setGenerateError(null);
                    }}
                  />
                  Upload image
                </label>
                <label className={\`mode-option \${!useUploadMode ? 'active' : ''} disabled\`} title="Coming soon">
                  <input
                    type="radio"
                    name="stickerMode"
                    checked={!useUploadMode}
                    disabled
                    readOnly
                  />
                  Select sticker (under development)
                </label>
              </div>
              {useUploadMode ? (
                <label className={\`image-upload \${stickerImagePreview ? 'has-image' : ''}\`}>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setStickerImagePreview(URL.createObjectURL(file));
                        setStickerImageFile(file);
                        setGeneratedImage(null);
                        setGeneratedImageBlob(null);
                        setGenerateError(null);
                      }
                    }}
                  />
                  {stickerImagePreview ? (
                    <img src={stickerImagePreview} alt="Reference" className="image-preview" />
                  ) : (
                    <span>📷 Upload reference image (sticker style)</span>
                  )}
                </label>
              ) : (
                <>
                  <select
                    className="sticker-pack-select"
                    value={selectedPack}
                    onChange={(e) => setSelectedPack(e.target.value)}
                  >
                    {stickerPacks.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <div className="custom-pack-row">
                    <input
                      type="text"
                      className="custom-pack-input"
                      placeholder="Or enter sticker pack name (e.g. from t.me/addstickers/...)"
                      value={customPackInput}
                      onChange={(e) => setCustomPackInput(e.target.value)}
                    />
                  </div>
                  {stickersLoading ? (
                    <div className="loading">Loading stickers...</div>
                  ) : (
                    <div className="sticker-grid">
                      {stickers.map((s) => (
                        <div
                          key={s.file_id}
                          className={\`sticker-item \${selectedSticker?.file_id === s.file_id ? 'selected' : ''}\`}
                          onClick={() => {
                            setSelectedSticker(s);
                            setGeneratedImage(null);
                            setGeneratedImageBlob(null);
                            setGenerateError(null);
                          }}
                        >
                          <StickerThumbnail
                            fileId={s.file_id}
                            authParam={authParam}
                            onError={(msg) => setStickerDebug(d => ({
                              ...d,
                              imageErrors: [...(d.imageErrors || []).slice(-4), msg]
                            }))}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
             
              {generateError && (
                <div className="error" style={{ marginTop: '12px' }}>{generateError}</div>
              )}
              {generatedImage && (
                <div style={{ marginTop: '16px' }}>
                  <h3>Generated sticker</h3>
                  <img src={generatedImage} alt="Generated" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }} />
                  <button
                    type="button"
                    className="send-telegram-btn"
                    style={{ marginTop: '12px' }}
                    disabled={sendToTelegramLoading}
                    onClick={async () => {
                      const blob = generatedImageBlob;
                      if (!blob) return;
                      setSendToTelegramLoading(true);
                      setSendToTelegramMessage(null);
                      try {
                        const formData = new FormData();
                        formData.append('image', new File([blob], 'sticker.png', { type: 'image/png' }));
                        const baseUrl = window.location.origin;
                        const auth = isDevMode() ? 'dev=1' : (initData ? \`_auth=\${encodeURIComponent(initData)}\` : '');
                        const res = await fetch(\`\${baseUrl}/api/send-sticker-to-user?\${auth}\`, {
                          method: 'POST',
                          body: formData
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          throw new Error(data.error || \`HTTP \${res.status}\`);
                        }
                        setSendToTelegramMessage('Sent! Check your Telegram chat.');
                      } catch (err) {
                        setSendToTelegramMessage(err?.message || 'Failed to send');
                      } finally {
                        setSendToTelegramLoading(false);
                      }
                    }}
                  >
                    {sendToTelegramLoading ? 'Sending...' : '📤 Send to Telegram'}
                  </button>
                  {sendToTelegramMessage && (
                    <div className={sendToTelegramMessage.startsWith('Sent') ? 'send-success' : 'error'} style={{ marginTop: '8px', fontSize: '14px' }}>
                      {sendToTelegramMessage}
                    </div>
                  )}
                </div>
              )}
              <button
                className="generate-btn"
                disabled={!canGenerate}
                onClick={async () => {
                  if (!canGenerate || !selectedImageFile) return;
                  if (useUploadMode && !stickerImageFile) return;
                  if (!useUploadMode && !selectedSticker) return;
                  setGenerateLoading(true);
                  setGenerateError(null);
                  setGeneratedImage(null);
                  setGeneratedImageBlob(null);
                  setSendToTelegramMessage(null);
                  try {
                    const formData = new FormData();
                    formData.append('actorImage', selectedImageFile);
                    if (useUploadMode && stickerImageFile) {
                      formData.append('stickerImage', stickerImageFile);
                    } else if (selectedSticker) {
                      formData.append('stickerFileId', selectedSticker.file_id);
                    }
                    const baseUrl = window.location.origin;
                    const auth = isDevMode() ? 'dev=1' : (initData ? \`_auth=\${encodeURIComponent(initData)}\` : '');
                    const res = await fetch(\`\${baseUrl}/api/generate-sticker?\${auth}\`, {
                      method: 'POST',
                      body: formData
                    });
                    if (!res.ok) {
                      const err = await res.json().catch(() => ({ error: res.statusText }));
                      throw new Error(err.error || \`HTTP \${res.status}\`);
                    }
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    setGeneratedImage(url);
                    setGeneratedImageBlob(blob);
                  } catch (err) {
                    setGenerateError(err?.message || 'Generation failed');
                  } finally {
                    setGenerateLoading(false);
                  }
                }}
              >
                {generateLoading ? 'Generating...' : 'Generate'}
              </button>
            </div>
          );
        }

        if (activeTab === TABS.admin) {
          if (selectedSession) {
            const session = selectedSession.session;
            const d = sessionDraft;
            return (
              <>
                <button
                  className="back-button"
                  onClick={() => {
                    cancelSessionEdit();
                    setSelectedSession(null);
                  }}
                >
                  ← Back to Sessions
                </button>
                <div className="session-detail">
                  <h2>{selectedSession.chatInfo?.title || \`Chat \${selectedSession.chatId}\`}</h2>

                  <div className="session-edit-toolbar">
                    {!sessionEditing ? (
                      <button type="button" className="edit-btn" onClick={beginSessionEdit}>
                        Edit
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="save-btn"
                          disabled={sessionSaveLoading}
                          onClick={saveSessionEdit}
                        >
                          {sessionSaveLoading ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="cancel-btn"
                          disabled={sessionSaveLoading}
                          onClick={cancelSessionEdit}
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                  {sessionSaveError && (
                    <div className="error" style={{ marginBottom: '12px' }}>{sessionSaveError}</div>
                  )}

                  <div className="detail-item">
                    <label>Chat ID</label>
                    <value>{selectedSession.chatId}</value>
                  </div>

                  <div className="detail-item">
                    <label>Model</label>
                    {sessionEditing && d ? (
                      <input
                        type="text"
                        value={d.model}
                        onChange={(e) =>
                          setSessionDraft((prev) =>
                            prev ? { ...prev, model: e.target.value } : prev
                          )
                        }
                      />
                    ) : (
                      <value>{session.model || 'not_set'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Prompt</label>
                    {sessionEditing && d ? (
                      <textarea
                        value={d.prompt}
                        onChange={(e) =>
                          setSessionDraft((prev) =>
                            prev ? { ...prev, prompt: e.target.value } : prev
                          )
                        }
                        rows={4}
                      />
                    ) : (
                      <value>{session.prompt || '(empty)'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Sticker Packs (comma-separated)</label>
                    {sessionEditing && d ? (
                      <input
                        type="text"
                        value={d.stickersPacksStr}
                        onChange={(e) =>
                          setSessionDraft((prev) =>
                            prev ? { ...prev, stickersPacksStr: e.target.value } : prev
                          )
                        }
                      />
                    ) : (
                      <value>{session.stickersPacks?.join(', ') || 'none'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Memories Count</label>
                    <value>{session.memories?.length || 0}</value>
                  </div>

                  <div className="detail-item">
                    <label>User Messages Count</label>
                    <value>{session.userMessages?.length || 0}</value>
                  </div>

                  <div className="detail-item">
                    <label>Toggle History</label>
                    {sessionEditing && d ? (
                      <label style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={d.toggle_history}
                          onChange={(e) =>
                            setSessionDraft((prev) =>
                              prev ? { ...prev, toggle_history: e.target.checked } : prev
                            )
                          }
                        />
                        Enabled
                      </label>
                    ) : (
                      <value>{session.toggle_history ? 'Enabled' : 'Disabled'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>First Time</label>
                    {sessionEditing && d ? (
                      <label style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={d.firstTime}
                          onChange={(e) =>
                            setSessionDraft((prev) =>
                              prev ? { ...prev, firstTime: e.target.checked } : prev
                            )
                          }
                        />
                        Yes
                      </label>
                    ) : (
                      <value>{session.firstTime ? 'Yes' : 'No'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Prompt Not Set</label>
                    {sessionEditing && d ? (
                      <label style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={d.promptNotSet}
                          onChange={(e) =>
                            setSessionDraft((prev) =>
                              prev ? { ...prev, promptNotSet: e.target.checked } : prev
                            )
                          }
                        />
                        Yes
                      </label>
                    ) : (
                      <value>{session.promptNotSet ? 'Yes' : 'No'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Sticker Not Set</label>
                    {sessionEditing && d ? (
                      <label style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={d.stickerNotSet}
                          onChange={(e) =>
                            setSessionDraft((prev) =>
                              prev ? { ...prev, stickerNotSet: e.target.checked } : prev
                            )
                          }
                        />
                        Yes
                      </label>
                    ) : (
                      <value>{session.stickerNotSet ? 'Yes' : 'No'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Directed reply gating</label>
                    {sessionEditing && d ? (
                      <label style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={d.directed_reply_gating}
                          onChange={(e) =>
                            setSessionDraft((prev) =>
                              prev
                                ? { ...prev, directed_reply_gating: e.target.checked }
                                : prev
                            )
                          }
                        />
                        <span style={{ marginLeft: '8px' }}>Only reply when addressed (groups)</span>
                      </label>
                    ) : (
                      <value>{session.chat_settings?.directed_reply_gating ? 'On' : 'Off'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Proactive revival (cron)</label>
                    {sessionEditing && d ? (
                      <label style={{ display: 'flex', alignItems: 'center', fontWeight: 400 }}>
                        <input
                          type="checkbox"
                          checked={d.proactive_enabled}
                          onChange={(e) =>
                            setSessionDraft((prev) =>
                              prev ? { ...prev, proactive_enabled: e.target.checked } : prev
                            )
                          }
                        />
                        <span style={{ marginLeft: '8px' }}>Enabled</span>
                      </label>
                    ) : (
                      <value>{session.chat_settings?.proactive_enabled ? 'On' : 'Off'}</value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Proactive stale hours</label>
                    {sessionEditing && d ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="empty = leave as in JSON / default 48"
                        value={d.proactive_stale_hours}
                        onChange={(e) =>
                          setSessionDraft((prev) =>
                            prev ? { ...prev, proactive_stale_hours: e.target.value } : prev
                          )
                        }
                      />
                    ) : (
                      <value>
                        {session.chat_settings?.proactive_stale_hours != null
                          ? String(session.chat_settings.proactive_stale_hours)
                          : '(default 48)'}
                      </value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Mood (Russian, ≥150 chars)</label>
                    {sessionEditing && d ? (
                      <textarea
                        value={d.mood_text}
                        onChange={(e) =>
                          setSessionDraft((prev) =>
                            prev ? { ...prev, mood_text: e.target.value } : prev
                          )
                        }
                        rows={8}
                        placeholder="Leave empty to clear. Min 150 Cyrillic chars, no Latin letters."
                      />
                    ) : (
                      <value style={{ whiteSpace: 'pre-wrap' }}>
                        {session.chat_settings?.mood_text
                          ? session.chat_settings.mood_text.slice(0, 280) +
                            (session.chat_settings.mood_text.length > 280 ? '…' : '')
                          : '(none)'}
                      </value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Chat Settings (JSON, advanced)</label>
                    {sessionEditing && d ? (
                      <textarea
                        value={d.chat_settings_json}
                        onChange={(e) =>
                          setSessionDraft((prev) =>
                            prev ? { ...prev, chat_settings_json: e.target.value } : prev
                          )
                        }
                        rows={6}
                      />
                    ) : (
                      <value>
                        {session.chat_settings
                          ? JSON.stringify(session.chat_settings, null, 2)
                          : '(none)'}
                      </value>
                    )}
                  </div>

                  <div className="detail-item">
                    <label>Memories</label>
                    {sessionEditing && d ? (
                      <textarea
                        value={d.memories_json}
                        onChange={(e) =>
                          setSessionDraft((prev) =>
                            prev ? { ...prev, memories_json: e.target.value } : prev
                          )
                        }
                        rows={10}
                      />
                    ) : session.memories && session.memories.length > 0 ? (
                      <value>
                        {session.memories.map((m, i) => (
                          <div
                            key={i}
                            style={{
                              marginTop: '8px',
                              padding: '8px',
                              background: 'rgba(0,0,0,0.05)',
                              borderRadius: '4px'
                            }}
                          >
                            <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>
                              {m.timestamp}
                            </div>
                            <div>{m.content}</div>
                          </div>
                        ))}
                      </value>
                    ) : (
                      <value>(none)</value>
                    )}
                  </div>
                </div>
              </>
            );
          }

          if (sessionsLoading) {
            return <div className="loading">Loading sessions...</div>;
          }

          if (sessions.length === 0) {
            return (
              <div className="empty-state">
                <h2>No admin chats found</h2>
                <p>You need to be an admin in at least one group chat where this bot is added.</p>
              </div>
            );
          }

          return (
            <>
              <h1 style={{ marginBottom: '16px', fontSize: '20px' }}>Admin Panel</h1>
              <p style={{ marginBottom: '16px', color: 'var(--tg-theme-hint-color, #999999)', fontSize: '14px' }}>
                Select a chat to view session details
              </p>
              <div className="session-list">
                {sessions.map((session) => (
                  <div
                    key={session.chatId}
                    className="session-item"
                    onClick={() => loadSessionDetail(session.chatId)}
                  >
                    <h3>{session.chatTitle || \`Chat \${session.chatId}\`}</h3>
                    <p>Model: {session.model || 'not_set'}</p>
                    <p>Prompt: {session.promptPreview || '(empty)'}</p>
                    <p>Stickers: {session.stickerPacksCount} packs</p>
                    <p>Memories: {session.memoriesCount}</p>
                    <p>Messages: {session.userMessagesCount}</p>
                  </div>
                ))}
              </div>
            </>
          );
        }

        return null;
      }

      return (
        <div className="container">
          {isDevMode() && (
            <div className="dev-banner">Dev mode: Open from Telegram for full auth. Use DevTools to debug.</div>
          )}
          <div className="tabs">
            <button
              className={\`tab \${activeTab === TABS.welcome ? 'active' : ''}\`}
              onClick={() => setActiveTab(TABS.welcome)}
            >
              Welcome
            </button>
            <button
              className={\`tab \${activeTab === TABS.admin ? 'active' : ''}\`}
              onClick={() => setActiveTab(TABS.admin)}
            >
              Admin
            </button>
            <button
              className={\`tab \${activeTab === TABS.stickers ? 'active' : ''}\`}
              onClick={() => setActiveTab(TABS.stickers)}
            >
              Stickers
            </button>
          </div>
          {renderTabContent()}
        </div>
      );
    }

    ReactDOM.render(<App />, document.getElementById('root'));
  </script>
</body>
</html>`

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8'
    }
  })
}
