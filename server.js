const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const NOTE_FILE = 'note.txt';
const HISTORY_FILE = 'history.json';

app.use(express.json());

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
  } catch (e) {
    return [];
  }
}

function addHistory(text) {
  const h = readHistory();
  h.unshift({ text: text, time: Date.now() });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h.slice(0, 10)));
}

/* ---------- HAUPTSEITE (OHNE TEMPLATE STRING) ---------- */
app.get('/', function (req, res) {
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
  res.write('button{background:#444;color:#fff;border:none;padding:6px 10px;border-radius:6px;}');
  res.write('button.danger{background:#e74c3c;}');
  res.write('textarea{width:100%;height:calc(100vh - 52px);font-size:16px;padding:10px;border:none;box-sizing:border-box;}');
  res.write('#history{display:none;position:fixed;bottom:0;left:0;right:0;max-height:40vh;background:#fff;border-top:1px solid #ccc;overflow:auto;}');
  res.write('.item{padding:8px;border-bottom:1px solid #eee;font-size:14px;}');
  res.write('</style>');
  res.write('</head>');
  res.write('<body>');

  res.write('<header>');
  res.write('<span>📝 Quick Notes</span>');
  res.write('<button id="paste">Paste</button>');
  res.write('<button id="historyBtn">History</button>');
  res.write('<button id="clear" class="danger">Clear</button>');
  res.write('</header>');

  res.write('<textarea id="note"></textarea>');
  res.write('<div id="history"></div>');

  res.write('<script>');
  res.write('const note=document.getElementById("note");');
  res.write('const historyDiv=document.getElementById("history");');
  res.write('document.getElementById("paste").onclick=async()=>{try{note.value+=await navigator.clipboard.readText();save();}catch(e){alert("Clipboard blockiert");}};');
  res.write('document.getElementById("clear").onclick=async()=>{if(note.value){await fetch("/history-add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:note.value})});note.value="";save();}};');
  res.write('document.getElementById("historyBtn").onclick=async()=>{if(historyDiv.style.display==="block"){historyDiv.style.display="none";return;}const r=await fetch("/history");const h=await r.json();historyDiv.innerHTML="";h.forEach(i=>{const d=document.createElement("div");d.className="item";d.textContent=i.text;d.onclick=()=>{note.value=i.text;historyDiv.style.display="none";save();};historyDiv.appendChild(d);});historyDiv.style.display="block";};');
  res.write('async function save(){clearTimeout(window.t);window.t=setTimeout(()=>fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:note.value})}),300);}');
  res.write('fetch("/note").then(r=>r.text()).then(t=>note.value=t);');
  res.write('</script>');

  res.write('</body></html>');
  res.end();
});

/* ---------- API ---------- */
app.get('/note', function (req, res) {
  res.send(readNote());
});

app.post('/note', function (req, res) {
  writeNote(req.body.text);
  res.sendStatus(200);
});

app.get('/history', function (req, res) {
  res.json(readHistory());
});

app.post('/history-add', function (req, res) {
  addHistory(req.body.text || '');
  res.sendStatus(200);
});

app.listen(PORT, function () {
  console.log('Server läuft auf Port ' + PORT);
});