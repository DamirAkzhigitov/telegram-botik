import { createBot } from './bot/createBot'
import { getSessions, getSession, getAdminChats } from './api/sessions'
import {
  getStickerPacks,
  getStickers,
  getStickerFile
} from './api/stickers'
import type { Update } from 'telegraf/types'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleUpdate(request, env)
  }
}

async function handleUpdate(request: Request, env: Env) {
  const url = new URL(request.url)
  const pathname = url.pathname

  // Handle POST requests for Telegram webhooks
  if (request.method === 'POST') {
    try {
      const bot = createBot(env)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const update = (await request.json()) as Update
      await bot.handleUpdate(update)

      return new Response('OK')
    } catch {
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
  // GET /api/sessions - List all sessions for admin chats
  if (pathname === '/api/sessions') {
    return getSessions(request, env)
  }

  // GET /api/sessions/:chatId - Get specific session
  const sessionMatch = pathname.match(/^\/api\/sessions\/(.+)$/)
  if (sessionMatch) {
    const chatId = sessionMatch[1]
    return getSession(request, env, chatId)
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
    .sticker-item img {
      width: 100%;
      height: 100%;
      object-fit: contain;
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
  </style>
</head>
<body>
  <div id="root">
    <div class="loading">Loading...</div>
  </div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    const TABS = { welcome: 'welcome', admin: 'admin', stickers: 'stickers' };

    function App() {
      const [activeTab, setActiveTab] = React.useState(TABS.welcome);
      const [sessions, setSessions] = React.useState([]);
      const [selectedSession, setSelectedSession] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [sessionsLoading, setSessionsLoading] = React.useState(false);
      const [error, setError] = React.useState(null);
      const [selectedImage, setSelectedImage] = React.useState(null);
      const [selectedSticker, setSelectedSticker] = React.useState(null);
      const [stickerPacks, setStickerPacks] = React.useState([]);
      const [stickers, setStickers] = React.useState([]);
      const [selectedPack, setSelectedPack] = React.useState('');
      const [stickersLoading, setStickersLoading] = React.useState(false);

      useEffect(() => {
        const tg = window.Telegram?.WebApp;
        if (!tg) {
          setError('Telegram Web App not available. Please open this app from Telegram.');
          setLoading(false);
          return;
        }

        tg.ready();
        tg.expand();

        const initData = tg.initData || '';
        if (!initData) {
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
        if (!initData) return;
        loadSessions(initData);
      }, [activeTab]);

      useEffect(() => {
        if (activeTab !== TABS.stickers) return;
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        if (!initData) return;
        const baseUrl = window.location.origin;
        fetch(\`\${baseUrl}/api/sticker-packs?_auth=\${encodeURIComponent(initData)}\`)
          .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load packs')))
          .then(data => {
            setStickerPacks(data.packs || []);
            if (data.packs?.length > 0 && !selectedPack) {
              setSelectedPack(data.packs[0]);
            }
          })
          .catch(() => setStickerPacks([]));
      }, [activeTab]);

      useEffect(() => {
        if (!selectedPack) return;
        const tg = window.Telegram?.WebApp;
        const initData = tg?.initData || '';
        if (!initData) return;
        setStickersLoading(true);
        const baseUrl = window.location.origin;
        fetch(\`\${baseUrl}/api/stickers?pack=\${encodeURIComponent(selectedPack)}&_auth=\${encodeURIComponent(initData)}\`)
          .then(res => res.ok ? res.json() : Promise.reject(new Error('Failed to load stickers')))
          .then(data => {
            setStickers(data.stickers || []);
            setSelectedSticker(null);
          })
          .catch(() => setStickers([]))
          .finally(() => setStickersLoading(false));
      }, [selectedPack]);

      function loadSessions(auth) {
        setSessionsLoading(true);
        const baseUrl = window.location.origin;
        const url = \`\${baseUrl}/api/sessions?_auth=\${encodeURIComponent(auth)}\`;
        
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
        
        if (!initData) {
          setError('Authentication required');
          return;
        }
        
        const baseUrl = window.location.origin;
        const url = \`\${baseUrl}/api/sessions/\${chatId}?_auth=\${encodeURIComponent(initData)}\`;
        
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
          const authParam = initData ? \`&_auth=\${encodeURIComponent(initData)}\` : '';
          const canGenerate = selectedImage && selectedSticker;
          return (
            <div className="stickers-section">
              <h2>1. Add image</h2>
              <label className={\`image-upload \${selectedImage ? 'has-image' : ''}\`}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setSelectedImage(URL.createObjectURL(file));
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
              <h2>2. Select sticker</h2>
              <select
                className="sticker-pack-select"
                value={selectedPack}
                onChange={(e) => setSelectedPack(e.target.value)}
              >
                {stickerPacks.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              {stickersLoading ? (
                <div className="loading">Loading stickers...</div>
              ) : (
                <div className="sticker-grid">
                  {stickers.map((s) => (
                    <div
                      key={s.file_id}
                      className={\`sticker-item \${selectedSticker?.file_id === s.file_id ? 'selected' : ''}\`}
                      onClick={() => setSelectedSticker(s)}
                    >
                      <img
                        src={\`\${baseUrl}/api/sticker-file?file_id=\${encodeURIComponent(s.file_id)}\${authParam}\`}
                        alt={s.emoji || ''}
                      />
                    </div>
                  ))}
                </div>
              )}
              <button
                className="generate-btn"
                disabled={!canGenerate}
                onClick={() => canGenerate && alert('Generate clicked! Image + sticker ready.')}
              >
                Generate
              </button>
            </div>
          );
        }

        if (activeTab === TABS.admin) {
          if (selectedSession) {
            const session = selectedSession.session;
            return (
              <>
                <button className="back-button" onClick={() => setSelectedSession(null)}>
                  ← Back to Sessions
                </button>
                <div className="session-detail">
              <h2>{selectedSession.chatInfo?.title || \`Chat \${selectedSession.chatId}\`}</h2>
              
              <div className="detail-item">
                <label>Chat ID</label>
                <value>{selectedSession.chatId}</value>
              </div>
              
              <div className="detail-item">
                <label>Model</label>
                <value>{session.model || 'not_set'}</value>
              </div>
              
              <div className="detail-item">
                <label>Prompt</label>
                <value>{session.prompt || '(empty)'}</value>
              </div>
              
              <div className="detail-item">
                <label>Sticker Packs</label>
                <value>{session.stickersPacks?.join(', ') || 'none'}</value>
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
                <value>{session.toggle_history ? 'Enabled' : 'Disabled'}</value>
              </div>
              
              <div className="detail-item">
                <label>First Time</label>
                <value>{session.firstTime ? 'Yes' : 'No'}</value>
              </div>
              
              <div className="detail-item">
                <label>Prompt Not Set</label>
                <value>{session.promptNotSet ? 'Yes' : 'No'}</value>
              </div>
              
              <div className="detail-item">
                <label>Sticker Not Set</label>
                <value>{session.stickerNotSet ? 'Yes' : 'No'}</value>
              </div>
              
              {session.chat_settings && (
                <div className="detail-item">
                  <label>Chat Settings</label>
                  <value>{JSON.stringify(session.chat_settings, null, 2)}</value>
                </div>
              )}
              
              {session.memories && session.memories.length > 0 && (
                <div className="detail-item">
                  <label>Memories</label>
                  <value>
                    {session.memories.map((m, i) => (
                      <div key={i} style={{ marginTop: '8px', padding: '8px', background: 'rgba(0,0,0,0.05)', borderRadius: '4px' }}>
                        <div style={{ fontSize: '12px', color: '#999', marginBottom: '4px' }}>{m.timestamp}</div>
                        <div>{m.content}</div>
                      </div>
                    ))}
                  </value>
                </div>
              )}
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
