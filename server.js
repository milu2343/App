const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const NOTE_FILE = 'note.txt';
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 50;

app.use(express.json());

/* ---------- Helpers ---------- */
function readNote() {
  if (!fs.existsSync(NOTE_FILE)) return '';
  return fs.readFileSync(NOTE_FILE, 'utf8');
}

function writeNote(text) {
  fs.writeFileSync(NOTE_FILE, text || '');
}

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); }
  catch { return []; }
}

function addHistory(text) {
  text = text.trim();
  if (!text) return;
  let h = readHistory();
  if (h[0] && h[0].text === text) return;
  h.unshift({ text, time: Date.now() });
  h = h.slice(0, MAX_HISTORY);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h));
}

function deleteHistory(index) {
  let h = readHistory();
  if (index >= 0 && index < h.length) {
    h.splice(index, 1);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(h));
  }
}

/* ---------- Seite ---------- */
app.get('/', (req, res) => {
  res.write(`<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Quick Notes</title>

<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eaeaea;}
header{display:flex;gap:6px;align-items:center;padding:10px;background:#1e1e1e;}
header span{flex:1;}
button{background:#2c2c2c;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:14px;}
button.danger{background:#b3261e;}
textarea{width:100%;height:calc(100vh - 52px);font-size:16px;padding:10px;border:none;box-sizing:border-box;background:#121212;color:#eaeaea;}
.tab{display:none;padding:10px;background:#1a1a1a;max-height:50vh;overflow:auto;border-top:1px solid #333;}
.item{padding:10px;border-bottom:1px solid #333;display:flex;justify-content:space-between;align-items:center;}
.item:hover{background:#222;}
.del{color:#ff5c5c;font-size:22px;font-weight:bold;cursor:pointer;margin-left:10px;}
#backBtn{background:#333;margin-bottom:8px;}
</style>
</head>

<body>

<header>
  <span>📝 Quick Notes</span>
  <button id="copy">Copy</button>
  <button id="paste">Paste</button>
  <button id="historyBtn">History</button>
  <button id="clear" class="danger">Clear</button>
</header>

<textarea id="note" placeholder="Notizen hier..."></textarea>

<div id="historyTab" class="tab">
  <button id="backBtn">← Back to Notes</button>
  <div id="historyList"></div>
</div>

<script>
const note = document.getElementById("note");
note.addEventListener("input", ()=>{
 save();
 lastText= note.value;
});
const historyTab = document.getElementById("historyTab");
const historyList = document.getElementById("historyList");

let lastText = "";

/* Save */
function save() {
  clearTimeout(window.t);
  window.t = setTimeout(() => {
    fetch("/note", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ text: note.value })
    });
  }, 300);
}

/* Initial load */
fetch("/note").then(r=>r.text()).then(t=>{
  note.value = t;
  lastText = t;
});

/* Live sync (alle 2s) */
setInterval(async ()=>{
  const r = await fetch("/note");
  const t = await r.text();
  if (document.activeElement !== note && t !== lastText) {
    note.value = t;
    lastText = t;
  }
}, 2000);

/* Copy */
document.getElementById("copy").onclick = async () => {
  try { await navigator.clipboard.writeText(note.value); }
  catch { alert("Copy blockiert"); }
};

/* Paste */
document.getElementById("paste").onclick = async () => {
  try {
    note.value += await navigator.clipboard.readText();
    save();
  } catch {
    alert("Paste blockiert");
  }
};

/* Clear */
document.getElementById("clear").onclick = async () => {
  if (!note.value) return;
  await fetch("/history-add", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ text: note.value })
  });
  note.value = "";
  save();
};

/* History öffnen */
document.getElementById("historyBtn").onclick = async () => {
  historyList.innerHTML = "";
  const r = await fetch("/history");
  const h = await r.json();

  h.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "item";

    const text = document.createElement("span");
    text.textContent = item.text;
    text.style.flex = "1";
    text.onclick = () => {
      note.value = item.text;
      save();
      historyTab.style.display = "none";
      note.style.display = "block";
    };

    const del = document.createElement("span");
    del.textContent = "×";
    del.className = "del";
    del.onclick = async (e) => {
      e.stopPropagation();
      await fetch("/history-del", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ index })
      });
      row.remove();
    };

    row.appendChild(text);
    row.appendChild(del);
    historyList.appendChild(row);
  });

  historyTab.style.display = "block";
  note.style.display = "none";
};

/* Back */
document.getElementById("backBtn").onclick = () => {
  historyTab.style.display = "none";
  note.style.display = "block";
};
</script>

</body></html>`);
  res.end();
});

/* ---------- API ---------- */
app.get('/note', (req,res)=>res.send(readNote()));
app.post('/note', (req,res)=>{ writeNote(req.body.text); res.sendStatus(200); });

app.get('/history', (req,res)=>res.json(readHistory()));
app.post('/history-add', (req,res)=>{ addHistory(req.body.text||''); res.sendStatus(200); });
app.post('/history-del', (req,res)=>{ deleteHistory(req.body.index); res.sendStatus(200); });

app.listen(PORT, () => console.log('Server läuft auf Port ' + PORT));
