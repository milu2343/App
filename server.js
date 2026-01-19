const express = require('express'); const fs = require('fs');

const app = express(); const PORT = process.env.PORT || 3001;

const NOTE_FILE = 'note.txt'; const HISTORY_FILE = 'history.json';

app.use(express.json());

// Hilfsfunktionen function readNote() { if (!fs.existsSync(NOTE_FILE)) return ''; return fs.readFileSync(NOTE_FILE, 'utf8'); }

function writeNote(text) { fs.writeFileSync(NOTE_FILE, text || ''); }

function addToHistory(text) { let history = []; if (fs.existsSync(HISTORY_FILE)) { try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } catch (e) { history = []; } } history.unshift({ text, time: new Date().toISOString() }); history = history.slice(0, 10); // max 10 Einträge fs.writeFileSync(HISTORY_FILE, JSON.stringify(history)); }

// Hauptseite app.get('/', function (req, res) { res.send(`<!DOCTYPE html>

<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quick Notes</title>
  <style>
    body { margin:0; font-family:sans-serif; background:#f5f5f5; }
    header {
      display:flex;
      gap:8px;
      align-items:center;
      padding:10px;
      background:#222;
      color:white;
    }
    header span { flex:1; }
    button {
      background:#444;
      color:white;
      border:none;
      padding:6px 10px;
      border-radius:6px;
      font-size:14px;
    }
    button.danger { background:#e74c3c; }
    textarea {
      width:100%;
      height:calc(100vh - 52px);
      font-size:16px;
      padding:10px;
      box-sizing:border-box;
      border:none;
      outline:none;
    }
    #history {
      position:fixed;
      bottom:0;
      left:0;
      right:0;
      max-height:40vh;
      background:#fff;
      border-top:1px solid #ccc;
      overflow:auto;
      display:none;
    }
    .item {
      padding:8px;
      border-bottom:1px solid #eee;
      cursor:pointer;
      font-size:14px;
    }
    .item:hover { background:#f0f0f0; }
  </style>
</head>
<body><header>
  <span>📝 Quick Notes</span>
  <button id="paste">Paste</button>
  <button id="historyBtn">History</button>
  <button id="clear" class="danger">Clear</button>
</header><textarea id="note" placeholder="Notizen hier..."></textarea><div id="history"></div><script>
  const note = document.getElementById('note');
  const clearBtn = document.getElementById('clear');
  const pasteBtn = document.getElementById('paste');
  const historyBtn = document.getElementById('historyBtn');
  const historyDiv = document.getElementById('history');

  async function loadNote() {
    const res = await fetch('/note');
    note.value = await res.text();
  }

  async function saveNote() {
    await fetch('/note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: note.value })
    });
  }

  async function loadHistory() {
    const res = await fetch('/history');
    const data = await res.json();
    historyDiv.innerHTML = '';
    data.forEach(h => {
      const div = document.createElement('div');
      div.className = 'item';
      div.textContent = h.text;
      div.onclick = async () => {
        note.value = h.text;
        historyDiv.style.display = 'none';
        await saveNote();
      };
      historyDiv.appendChild(div);
    });
  }

  note.addEventListener('input', () => {
    clearTimeout(window.t);
    window.t = setTimeout(saveNote, 400);
  });

  clearBtn.onclick = async () => {
    if (!note.value) return;
    await fetch('/history-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: note.value })
    });
    note.value = '';
    await saveNote();
  };

  pasteBtn.onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      note.value += text;
      await saveNote();
    } catch (e) {
      alert('Clipboard nicht erlaubt');
    }
  };

  historyBtn.onclick = async () => {
    if (historyDiv.style.display === 'block') {
      historyDiv.style.display = 'none';
    } else {
      await loadHistory();
      historyDiv.style.display = 'block';
    }
  };

  loadNote();
</script></body>
</html>`);
});// Note lesen app.get('/note', function (req, res) { res.send(readNote()); });

// Note speichern app.post('/note', function (req, res) { writeNote(req.body.text || ''); res.sendStatus(200); });

// History lesen app.get('/history', function (req, res) { if (!fs.existsSync(HISTORY_FILE)) return res.json([]); try { res.json(JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))); } catch (e) { res.json([]); } });

// History hinzufügen app.post('/history-add', function (req, res) { addToHistory(req.body.text || ''); res.sendStatus(200); });

app.listen(PORT, function () { console.log('Server läuft auf Port ' + PORT); });