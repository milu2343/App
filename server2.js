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
  categories: {},
  feed: []
};

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } else {
    saveData();
  }
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

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data }));
});

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

app.post("/cat/edit", (req, res) => {
  if (req.body.old && data.categories[req.body.old]) {
    const notes = data.categories[req.body.old];
    delete data.categories[req.body.old];
    data.categories[req.body.new] = notes;
    saveData();
  }
  res.sendStatus(200);
});

app.post("/cat/delete", (req, res) => {
  delete data.categories[req.body.name];
  saveData();
  res.sendStatus(200);
});

app.post("/note/add", (req, res) => {
  data.categories[req.body.cat].unshift({
    text: req.body.text,
    time: Date.now()
  });
  saveData();
  res.sendStatus(200);
});

app.post("/note/delete", (req, res) => {
  data.categories[req.body.cat].splice(req.body.i, 1);
  saveData();
  res.sendStatus(200);
});

/* ---------- SOCIAL / FEED ---------- */
app.post("/feed/add", (req, res) => {
  data.feed.unshift({
    user: req.body.user || "Anon",
    text: req.body.text,
    time: Date.now()
  });
  saveData();
  res.sendStatus(200);
});

app.post("/feed/delete", (req, res) => {
  data.feed.splice(req.body.i, 1);
  saveData();
  res.sendStatus(200);
});

/* ---------- BACKUP ---------- */
app.get("/backup", (_, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=data.json");
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(data, null, 2));
});

/* ---------- UI ---------- */
app.get("/", (_, res) => {
res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notes / Social</title>
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif}
header{display:flex;align-items:center;padding:10px;background:#1e1e1e}
#menuBtn{font-size:20px;margin-right:10px;cursor:pointer}
nav{position:absolute;top:0;left:-200px;width:200px;height:100vh;background:#1e1e1e;transition:0.3s;display:flex;flex-direction:column;padding:10px;gap:6px}
nav.show{left:0}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer;text-align:left}
.tab{display:none;padding:10px;height:calc(100vh - 60px);overflow:auto}
textarea,input{width:100%;padding:6px;border-radius:6px;border:1px solid #333;background:#121212;color:#eee;margin-bottom:6px}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
#quickBtns button{margin-right:6px;}
</style>
</head>
<body>

<header>
<span id="menuBtn">&#9776;</span>
<h1>Notes</h1>
</header>

<nav id="menu">
<button onclick="show('quick');toggleMenu()">Quick</button>
<button onclick="show('notes');toggleMenu()">Kategorien</button>
<button onclick="show('history');toggleMenu()">History</button>
<button onclick="show('feed');toggleMenu()">Feed</button>
<button onclick="downloadBackup()">Backup</button>
</nav>

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
<input id="newNote" placeholder="Neue Notiz...">
<button onclick="addNote()">Speichern</button>
</div>
<input id="newCat" placeholder="Neue Kategorie">
<button onclick="addCat()">Kategorie +</button>
<div id="cats"></div>
</div>

<div id="history" class="tab"></div>
<div id="feed" class="tab">
<input id="newPost" placeholder="Neuen Beitrag schreiben...">
<button onclick="addPost()">Posten</button>
<div id="feedItems"></div>
</div>

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

function toggleMenu(){document.getElementById("menu").classList.toggle("show");}

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}
show("quick");

q.oninput = () =>
  fetch("/quick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:q.value})});

function clearQuick(){
  fetch("/clear",{method:"POST"});
}
function copyQuick(){navigator.clipboard.writeText(q.value);}
function pasteQuick(){navigator.clipboard.readText().then(t=>q.value=t);}

function render(){
  q.value = state.quick || "";

  // History
  document.getElementById("history").innerHTML =
    (state.history||[]).map((h,i)=>
      \`<div class="item">
        \${h}
        <button onclick="editHist(\${i})">✏️</button>
        <button onclick="delHist(\${i})">🗑</button>
      </div>\`).join("");

  // Kategorien
  const catsDiv = document.getElementById("cats");
  if(!activeCat){
    catsDiv.innerHTML = Object.keys(state.categories||{}).map(c=>
      \`<div class="item">
        <span onclick="openCat('\${c}')">\${c}</span>
        <button onclick="delCat('\${c}')">🗑</button>
      </div>\`).join("");
  } else {
    const notesDiv = state.categories[activeCat] || [];
    catsDiv.innerHTML =
      '<div><input id="newNote" placeholder="Neue Notiz..."><button onclick="addNote()">Speichern</button></div>' +
      notesDiv.map((n,i)=>
        \`<div class="item">\${n.text} <small>\${new Date(n.time).toLocaleString()}</small>
          <button onclick="delNote(\${i})">🗑</button>
        </div>\`).join("") +
      '<button onclick="activeCat=null;render()">⬅ Zurück</button>';
  }

  // Feed
  document.getElementById("feedItems").innerHTML =
    state.feed.map((f,i)=>
      \`<div class="item"><b>\${f.user}</b> <small>\${new Date(f.time).toLocaleString()}</small><br>\${f.text}
        <button onclick="delPost(\${i})">🗑</button>
      </div>\`).join("");
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
function delCat(n){
  if(confirm("Kategorie löschen?")) fetch("/cat/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n})});
}
function openCat(c){
  activeCat=c;
  render();
}
function addNote(){
  const t=document.getElementById("newNote").value.trim();
  if(!t) return;
  fetch("/note/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,text:t})});
  document.getElementById("newNote").value="";
}
function delNote(i){
  fetch("/note/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})});
}

function addPost(){
  const t=document.getElementById("newPost").value.trim();
  if(!t) return;
  fetch("/feed/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({user:"User1",text:t})});
  document.getElementById("newPost").value="";
}
function delPost(i){
  fetch("/feed/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({i})});
}

function downloadBackup(){
  window.location.href="/backup";
}
</script>
</body>
</html>`);
});

/* ---------- START ---------- */
loadData();
server.listen(PORT, () => console.log("Server 2 läuft stabil mit Social/Feed"));