import { createBot } from './bot/createBot'
import { getSessions, getSession, getAdminChats } from './api/sessions'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleUpdate(request, env)
  }
}

async function handleUpdate(request: Request, env: Env) {
  const url = new URL(request.url)
  const pathname = url.pathname

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

    return new Response('Not Found', { status: 404 })
  }

  // Handle POST requests for Telegram webhooks
  if (request.method === 'POST') {
    try {
      const bot = await createBot(env)
      const update = await request.json()
      await bot.handleUpdate(update as any)

      return new Response('OK')
    } catch (error) {
      return new Response('Invalid request', { status: 400 })
    }
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

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  })
}

async function serveAdminPanel(request: Request, env: Env): Promise<Response> {
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
  </style>
</head>
<body>
  <div id="root">
    <div class="loading">Loading admin panel...</div>
  </div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    function App() {
      const [sessions, setSessions] = React.useState([]);
      const [selectedSession, setSelectedSession] = React.useState(null);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState(null);

      useEffect(() => {
        // Get initData from Telegram Web App
        const tg = window.Telegram?.WebApp;
        if (!tg) {
          setError('Telegram Web App not available. Please open this app from Telegram.');
          setLoading(false);
          return;
        }

        tg.ready();
        tg.expand();

        // Get initData from Telegram Web App
        // initData is a query string that Telegram provides when opened from Telegram
        const initData = tg.initData || '';
        
        if (!initData) {
          setError('Authentication required. Please open this app from Telegram.');
          setLoading(false);
          return;
        }

        loadSessions(initData);
      }, []);

      function loadSessions(auth) {
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
            setLoading(false);
          })
          .catch(err => {
            console.error('Error loading sessions:', err);
            setError(err.message);
            setLoading(false);
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
        return <div className="loading">Loading sessions...</div>;
      }

      if (error) {
        return <div className="error">{error}</div>;
      }

      if (selectedSession) {
        const session = selectedSession.session;
        return (
          <div className="container">
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
          </div>
        );
      }

      if (sessions.length === 0) {
        return (
          <div className="container">
            <div className="empty-state">
              <h2>No admin chats found</h2>
              <p>You need to be an admin in at least one group chat where this bot is added.</p>
            </div>
          </div>
        );
      }

      return (
        <div className="container">
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
