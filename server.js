// server.js // Minimal Notiz-App mit PWA-Unterstützung, läuft auf http://localhost:3001 // Notizen werden serverseitig gespeichert

const express = require('express'); const fs = require('fs');

const app = express(); const PORT = 3001; const DATA_FILE = 'note.txt';

app.use(express.json());

// PWA-Dateien direkt ausliefern app.get('/manifest.json', (req, res) => { res.json({ name: "Quick Notes", short_name: "Notes", start_url: "/", display: "standalone", background_color: "#f5f5f5", theme_color: "#222222", icons: [ { src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" } ] }); });

app.get('/service-worker.js', (req, res) => { res.type('application/javascript'); res.send(` const CACHE_NAME = 'quick-notes-cache-v1'; const urlsToCache = ['/', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});

`); });

// Icons als Base64 einbetten (keine zusätzlichen Dateien nötig) app.get('/icon-192.png', (req, res) => { const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAADICAYAAACt...'; // Hier dein Base64-Icon einfügen const img = Buffer.from(base64, 'base64'); res.type('png').send(img); }); app.get('/icon-512.png', (req, res) => { const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHe...'; // Base64-Icon const img = Buffer.from(base64, 'base64'); res.type('png').send(img); });

// Hauptseite app.get('/', (req, res) => { res.send(`<!DOCTYPE html>

<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Notes</title>
  <link rel="manifest" href="/manifest.json">
  <script>
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(() => console.log('Service Worker registriert'));
    }
  </script>
  <style>
    body { font-family: sans-serif; margin: 0; padding: 0; background:#f5f5f5; }
    header { display:flex; justify-content:space-between; align-items:center; padding:10px 15px; background:#222; color:#fff; }
    button { padding:6px 12px; border:none; border-radius:6px; cursor:pointer; }
    #clear { background:#e74c3c; color:white; }
    textarea { width:100%; height:calc(100vh - 60px); padding:15px; box-sizing:border-box; font-size:16px; border:none; outline:none; }
  </style>
</head>
<body>
  <header>
    <div>📝 Quick Notes</div>
    <button id="clear">Clear</button>
  </header>
  <textarea id="note" placeholder="Notizen hier reinkopieren..."></textarea>  <script>
    const textarea = document.getElementById('note');
    const clearBtn = document.getElementById('clear');

    async function loadNote() {
      const res = await fetch('/note');
      textarea.value = await res.text();
    }

    async function saveNote() {
      await fetch('/note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textarea.value })
      });
    }

    textarea.addEventListener('input', () => {
      clearTimeout(window._t);
      window._t = setTimeout(saveNote, 300);
    });

    clearBtn.addEventListener('click', async () => {
      textarea.value = '';
      await saveNote();
    });

    loadNote();
  </script></body>
</html>`);
});// Notizen-Endpunkte app.get('/note', (req, res) => { if (!fs.existsSync(DATA_FILE)) return res.send(''); res.send(fs.readFileSync(DATA_FILE, 'utf8')); }); app.post('/note', (req, res) => { fs.writeFileSync(DATA_FILE, req.body.text || ''); res.sendStatus(200); });

app.listen(PORT, function() { console.log('Server läuft auf http://localhost:' + PORT); });