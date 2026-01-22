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
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;margin-bottom:8px}
.item{border-bottom:1px solid #333;padding:8px}
.row{display:flex;gap:6px;flex-wrap:wrap}
.topbar{display:flex;gap:6px;margin-bottom:8px}
</style>
</head>
<body>

<header>
<button onclick="show('quick')">Quick</button>
<button onclick="show('cats')">Kategorien</button>
<button onclick="show('history')">History</button>
</header>

<!-- QUICK -->
<div id="quick" class="tab">
<div class="row">
<button onclick="copyQuick()">Copy</button>
<button onclick="pasteQuick()">Paste</button>
<button onclick="clearQuick()">Clear → History</button>
</div>
<textarea id="q" placeholder="Quick Notes..."></textarea>
</div>

<!-- KATEGORIEN LISTE -->
<div id="cats" class="tab">
<input id="newCat" placeholder="Neue Kategorie">
<button onclick="addCat()">Kategorie +</button>
<div id="catsList"></div>
</div>

<!-- KATEGORIE VIEW -->
<div id="catView" class="tab">
<div class="topbar">
<button onclick="backToCats()">← Zurück</button>
<button onclick="renameActiveCat()">✏️ Umbenennen</button>
<button onclick="deleteActiveCat()">🗑 Löschen</button>
</div>
<input id="newNote" placeholder="Neue Notiz...">
<button onclick="addNote()">Speichern</button>
<div id="catNotes"></div>
</div>

<!-- HISTORY -->
<div id="history" class="tab"></div>

<script>
let ws, state={}, activeCat=null;
const q=document.getElementById("q");

function connect(){
  ws=new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage=e=>{
    state=JSON.parse(e.data).data;
    render();
  };
}
connect();

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
}

show("quick");

q.oninput=()=>fetch("/quick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:q.value})});
function clearQuick(){fetch("/clear",{method:"POST"});}
function copyQuick(){navigator.clipboard.writeText(q.value);}
function pasteQuick(){navigator.clipboard.readText().then(t=>q.value=t);}

function render(){
  q.value=state.quick||"";

  /* HISTORY */
  history.innerHTML=(state.history||[]).map((h,i)=>`
  <div class="item">
    ${h}
    <button onclick="editHist(${i})">✏️</button>
    <button onclick="delHist(${i})">🗑</button>
  </div>`).join("");

  /* CATEGORIES */
  catsList.innerHTML=Object.keys(state.categories||{}).map(c=>`
  <div class="item">
    <button onclick="openCat('${c}')">${c}</button>
  </div>`).join("");

  /* CATEGORY NOTES */
  if(activeCat){
    catNotes.innerHTML=(state.categories[activeCat]||[]).map((n,i)=>`
    <div class="item">
      ${n.text}
      <button onclick="delNote(${i})">🗑</button>
    </div>`).join("");
  }
}

/* HISTORY */
function editHist(i){
  fetch("/history/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({i})});
  show("quick");
}
function delHist(i){
  if(confirm("Eintrag löschen?"))
    fetch("/history/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({i})});
}

/* CATEGORIES */
function addCat(){
  const v=newCat.value.trim();
  if(v) fetch("/cat/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:v})});
  newCat.value="";
}

function openCat(c){
  activeCat=c;
  show("catView");
  render();
}

function backToCats(){
  activeCat=null;
  show("cats");
}

function renameActiveCat(){
  const n=prompt("Neuer Name",activeCat);
  if(n) fetch("/cat/rename",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({oldName:activeCat,newName:n})});
  activeCat=n;
}

function deleteActiveCat(){
  if(confirm("Kategorie wirklich löschen?")){
    fetch("/cat/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:activeCat})});
    backToCats();
  }
}

/* NOTES */
function addNote(){
  const t=newNote.value.trim();
  if(!t) return;
  fetch("/note/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,text:t})});
  newNote.value="";
}
function delNote(i){
  fetch("/note/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})});
}
</script>
</body>
</html>
`);});

/* ---------- START ---------- */
loadData();
server.listen(PORT, () => console.log("Server läuft stabil"));
