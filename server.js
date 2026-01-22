import express from "express";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;
const DATA_FILE = "./data.json";

app.use(express.json());

/* ---------- DATA ---------- */
let data = {
  quick: "",
  history: [],
  categories: {}
};

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } else saveData();
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  broadcast();
}

/* ---------- LIVE SYNC ---------- */
function broadcast() {
  const msg = JSON.stringify({ type: "sync", data });
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(msg);
  });
}

wss.on("connection", ws => ws.send(JSON.stringify({ type: "sync", data })));

/* ---------- API ---------- */
app.get("/data", (_, res) => res.json(data));

app.post("/quick", (req, res) => {
  data.quick = req.body.text || "";
  saveData();
  res.sendStatus(200);
});

app.post("/clear", (_, res) => {
  if (data.quick && data.history[0] !== data.quick) {
    data.history.unshift(data.quick);
    data.history = data.history.slice(0, 50);
  }
  data.quick = "";
  saveData();
  res.sendStatus(200);
});

app.post("/history/delete", (req, res) => {
  data.history.splice(req.body.i, 1);
  saveData();
  res.sendStatus(200);
});

app.post("/history/edit", (req, res) => {
  data.quick = data.history[req.body.i];
  saveData();
  res.sendStatus(200);
});

app.post("/cat/add", (req, res) => {
  if (!data.categories[req.body.name]) {
    data.categories = { [req.body.name]: [], ...data.categories };
    saveData();
  }
  res.sendStatus(200);
});

app.post("/cat/delete", (req, res) => {
  delete data.categories[req.body.name];
  saveData();
  res.sendStatus(200);
});

app.post("/cat/rename", (req, res) => {
  const { oldName, newName } = req.body;
  if (data.categories[oldName] && newName) {
    data.categories = { ...data.categories, [newName]: data.categories[oldName] };
    delete data.categories[oldName];
    saveData();
  }
  res.sendStatus(200);
});

app.post("/note/add", (req, res) => {
  const { cat, text } = req.body;
  if (!cat || !text) return res.sendStatus(400);
  data.categories[cat].unshift({ text, time: Date.now() });
  saveData();
  res.sendStatus(200);
});

app.post("/note/delete", (req, res) => {
  const { cat, i } = req.body;
  data.categories[cat].splice(i, 1);
  saveData();
  res.sendStatus(200);
});

/* ---------- UI ---------- */
app.get("/", (_, res) => {
res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notes</title>
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
.tab{display:none;padding:10px;height:calc(100vh - 60px);overflow:auto}
#quick{display:block;}
textarea{width:100%;height:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
input{width:70%;padding:6px;border-radius:6px;border:1px solid #333;background:#121212;color:#eee;margin-right:6px}
#quickBtns button{margin-right:6px;}
</style>
</head>
<body>

<header>
<button onclick="show('quick')">Quick</button>
<button onclick="show('notes')">Kategorien</button>
<button onclick="show('history')">History</button>
</header>

<div id="quick" class="tab">
<div id="quickBtns">
<button onclick="copyQuick()">Copy</button>
<button onclick="pasteQuick()">Paste</button>
<button onclick="clearQuick()">Clear → History</button>
</div>
<textarea id="q" placeholder="Quick Notes..."></textarea>
</div>

<div id="notes" class="tab">
<div>
<input id="newCat" placeholder="Neue Kategorie">
<button onclick="addCat()">Kategorie +</button>
</div>
<div id="cats"></div>
<div id="catNotes"></div>
</div>

<div id="history" class="tab"></div>

<script>
let ws, state = {}, activeCat = null;
const q = document.getElementById("q");

function connect(){
  ws = new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage = e => {
    state = JSON.parse(e.data).data;
    render();
  };
}
connect();

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  const tab = document.getElementById(id);
  if(tab) tab.style.display="block";
  render();
}

document.addEventListener("DOMContentLoaded", ()=>show("quick"));

q.oninput = () =>
  fetch("/quick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:q.value})});

function clearQuick(){ fetch("/clear",{method:"POST"}); }
function copyQuick(){navigator.clipboard.writeText(q.value);}
function pasteQuick(){navigator.clipboard.readText().then(t=>q.value=t);}

function render(){
  q.value = state.quick || "";

  // History
  const histDiv = document.getElementById("history");
  histDiv.innerHTML = (state.history||[]).map((h,i)=>
    \`<div class="item">\${h}<button onclick="editHist(\${i})">✏️</button><button onclick="delHist(\${i})">🗑</button></div>\`).join("");

  // Kategorien
  const catsDiv = document.getElementById("cats");
  catsDiv.innerHTML = '';
  Object.keys(state.categories||{}).forEach(c=>{
    const item = document.createElement("div");
    item.className = "item";
    const btn = document.createElement("button");
    btn.textContent = c;
    btn.onclick = ()=>openCat(c);
    const del = document.createElement("button");
    del.textContent="🗑";
    del.onclick = ()=>{if(confirm("Kategorie löschen?")) delCat(c)};
    const rename = document.createElement("button");
    rename.textContent="✏️";
    rename.onclick = ()=>{ const n = prompt("Neuer Name",c); if(n) renameCat(c,n)};
    item.appendChild(btn); item.appendChild(rename); item.appendChild(del);
    catsDiv.appendChild(item);
  });

  // Aktive Kategorie Notizen
  const catNotes = document.getElementById("catNotes");
  catNotes.innerHTML="";
  if(activeCat && state.categories[activeCat]){
    const notes = state.categories[activeCat];
    const div = document.createElement("div");
    const inp = document.createElement("input");
    inp.id="newNote";
    inp.placeholder="Neue Notiz...";
    const btn = document.createElement("button");
    btn.textContent="Speichern";
    btn.onclick=addNote;
    div.appendChild(inp); div.appendChild(btn);
    catNotes.appendChild(div);

    notes.forEach((n,i)=>{
      const d = document.createElement("div");
      d.className="item";
      d.textContent=n.text;
      const del = document.createElement("button");
      del.textContent="🗑";
      del.onclick=()=>delNote(i);
      d.appendChild(del);
      catNotes.appendChild(d);
    });
  }
}

function editHist(i){
  fetch("/history/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({i})});
}

function delHist(i){
  fetch("/history/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({i})});
}

function addCat(){
  const v=document.getElementById("newCat").value.trim();
  if(v) fetch("/cat/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:v})});
}

function delCat(n){ fetch("/cat/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n})}); }
function renameCat(oldN,newN){ fetch("/cat/rename",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldName:oldN,newName:newN})}); }

function openCat(c){ activeCat=c; render(); }

function addNote(){
  const t=document.getElementById("newNote").value.trim();
  if(!t) return;
  fetch("/note/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,text:t})});
  document.getElementById("newNote").value="";
}
function delNote(i){
  fetch("/note/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})});
}
</script>
</body>
</html>`);});

/* ---------- START ---------- */
loadData();
server.listen(PORT, () => console.log("Server läuft stabil"));
