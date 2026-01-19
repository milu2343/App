const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const NOTE_FILE = 'note.txt';
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 50;

app.use(express.json());

// ---------------- Helper ----------------
function readNote() {
  if (!fs.existsSync(NOTE_FILE)) return '';
  return fs.readFileSync(NOTE_FILE, 'utf8');
}

function writeNote(text) {
  fs.writeFileSync(NOTE_FILE, text || '');
}

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch(e) { return []; }
}

function addHistory(text) {
  text = text.trim();
  if (!text) return;

  let h = readHistory();
  if (h.length > 0 && h[0].text === text) return;

  h.unshift({ text, time: Date.now() });
  h = h.slice(0, MAX_HISTORY);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h));
}

function deleteHistory(index) {
  let h = readHistory();
  h.splice(index, 1);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h));
}

// ---------------- Hauptseite ----------------
app.get('/', (req, res) => {
  res.write('<!DOCTYPE html>');
  res.write('<html lang="de">');
  res.write('<head>');
  res.write('<meta charset="UTF-8">');
  res.write('<meta name="viewport" content="width=device-width, initial-scale=1.0">');
  res.write('<title>Quick Notes</title>');
  res.write('<style>');
  res.write('body{margin:0;font-family:sans-serif;background:#f5f5f5;}');
  res.write('header{display:flex;gap:6px;align-items:center;padding:10px;background:#222;color:#fff;}');
  res.write('header span{flex:1;}');
  res.write('button{background:#444;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:14px;}');
  res.write('button.danger{background:#e74c3c;}');
  res.write('textarea{width:100%;height:calc(100vh - 52px);font-size:16px;padding:10px;border:none;box-sizing:border-box;}');
  res.write('.tab{display:none;padding:10px;background:#fff;max-height:40vh;overflow:auto;border-top:1px solid #ccc;}');
  res.write('.item{padding:8px;border-bottom:1px solid #eee;cursor:pointer;}');
  res.write('.item:hover{background:#f0f0f0;}');
  res.write('.del{float:right;color:red;font-weight:bold;cursor:pointer;margin-left:10px;}');
  res.write('</style>');
  res.write('</head>');
  res.write('<body>');

  // Header mit Buttons
  res.write('<header>');
  res.write('<span>📝 Quick Notes</span>');
  res.write('<button id="paste">Paste</button>');
  res.write('<button id="historyBtn">History</button>');
  res.write('<button id="clear" class="danger">Clear</button>');
  res.write('</header>');

  // Textarea + History Tab
  res.write('<textarea id="note" placeholder="Notizen hier..."></textarea>');
  res.write('<div id="historyTab" class="tab"></div>');

  // ---------------- JS ----------------
  res.write('<script>');
  res.write('const note=document.getElementById("note");');
  res.write('const historyTab=document.getElementById("historyTab");');

  // Paste Button
  res.write('document.getElementById("paste").onclick=async()=>{try{note.value+=await navigator.clipboard.readText();save();}catch(e){alert("Clipboard blockiert");}};');

  // Clear Button + History hinzufügen
  res.write('document.getElementById("clear").onclick=async()=>{if(!note.value)return;await fetch("/history-add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:note.value})});note.value="";save();};');

  // History Tab Button
  res.write('document.getElementById("historyBtn").onclick=async()=>{if(historyTab.style.display==="block"){historyTab.style.display="none";return;}const r=await fetch("/history");const h=await r.json();historyTab.innerHTML="";h.forEach((i,index)=>{const d=document.createElement("div");d.className="item";d.textContent=i.text;d.onclick=()=>{note.value=i.text;save();};const del=document.createElement("span");del.textContent="×";del.className="del";del.onclick=async(e)=>{e.stopPropagation();await fetch("/history-del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({index})});d.remove();};d.appendChild(del);historyTab.appendChild(d);});historyTab.style.display="block";};');

  // Save Funktion
  res.write('async function save(){clearTimeout(window.t);window.t=setTimeout(()=>fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:note.value})}),300);}');

  // Initial Note Laden
  res.write('fetch("/note").then(r=>r.text()).then(t=>note.value=t);');

  res.write('</script>');
  res.write('</body></html>');
  res.end();
});

// ---------------- API ----------------
app.get('/note', (req,res)=>{ res.send(readNote()); });
app.post('/note', (req,res)=>{ writeNote(req.body.text); res.sendStatus(200); });

app.get('/history', (req,res)=>{ res.json(readHistory()); });
app.post('/history-add', (req,res)=>{ addHistory(req.body.text||''); res.sendStatus(200); });
app.post('/history-del', (req,res)=>{ deleteHistory(req.body.index); res.sendStatus(200); });

app.listen(PORT, ()=>{ console.log('Server läuft auf Port '+PORT); });