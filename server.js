// server.js // Minimal Notiz-App: laeuft auf http://localhost:3001 // Notizen werden serverseitig gespeichert, damit sie auf PC & Handy gleich sind

const express = require('express'); const fs = require('fs'); const path = require('path');

const app = express(); const PORT = 3001; const DATA_FILE = path.join(__dirname, 'note.txt');

app.use(express.json());

app.get('/', (req, res) => { res.send(`<!DOCTYPE html>

<html lang="de">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quick Notes</title>
  <style>
    body { font-family: sans-serif; margin: 0; padding: 0; background:#f5f5f5; }
    header { display:flex; justify-content:space-between; align-items:center; padding:10px 15px; background:#222; color:#fff; }
    button { padding:6px 12px; border:none; border-radius:6px; cursor:pointer; }
    #clear { background:#e74c3c; color:white; }
    textarea { width:100%; height:calc(100vh - 60px); padding:15px; box-sizing:border-box; font-size:16px; border:none; outline:none; }
  </style>
<link rel="manifest" href="/manifest.json">
<script>
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js')
      .then(() => console.log('Service Worker registriert'));
  }
</script>
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
});app.get('/note', (req, res) => { if (!fs.existsSync(DATA_FILE)) return res.send(''); res.send(fs.readFileSync(DATA_FILE, 'utf8')); });

app.post('/note', (req, res) => { fs.writeFileSync(DATA_FILE, req.body.text || ''); res.sendStatus(200); });

app.listen(PORT, function() {
  console.log('Server läuft auf http://localhost:' + PORT);
});