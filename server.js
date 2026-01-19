const express = require('express');
const fs = require('fs');

const app = express();
const PORT = 3001;
const FILE = 'note.txt';

app.use(express.json());

/* Hauptseite */
app.get('/', function (req, res) {
  res.send(`
<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Quick Notes</title>
  <style>
    body { margin:0; font-family:sans-serif; }
    header {
      display:flex;
      justify-content:space-between;
      align-items:center;
      padding:10px;
      background:#222;
      color:white;
    }
    textarea {
      width:100%;
      height:calc(100vh - 52px);
      font-size:16px;
      padding:10px;
      box-sizing:border-box;
      border:none;
      outline:none;
    }
    button {
      background:#e74c3c;
      color:white;
      border:none;
      padding:6px 12px;
      border-radius:6px;
    }
  </style>
</head>
<body>

<header>
  <div>📝 Quick Notes</div>
  <button id="clear">Clear</button>
</header>

<textarea id="note" placeholder="Notizen hier..."></textarea>

<script>
  const note = document.getElementById('note');
  const clearBtn = document.getElementById('clear');

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

  note.addEventListener('input', () => {
    clearTimeout(window.t);
    window.t = setTimeout(saveNote, 300);
  });

  clearBtn.onclick = async () => {
    note.value = '';
    await saveNote();
  };

  loadNote();
</script>

</body>
</html>
`);
});

/* Note lesen */
app.get('/note', function (req, res) {
  if (!fs.existsSync(FILE)) return res.send('');
  res.send(fs.readFileSync(FILE, 'utf8'));
});

/* Note speichern */
app.post('/note', function (req, res) {
  fs.writeFileSync(FILE, req.body.text || '');
  res.sendStatus(200);
});

/* Server starten */
app.listen(PORT, function () {
  console.log('Server läuft auf Port ' + PORT);
});