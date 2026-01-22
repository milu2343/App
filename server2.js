import express from "express";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3002;
const DATA_FILE = "./server2_data.json";

app.use(express.json());

/* ---------- DATA ---------- */
let data = {
  users: {}, // userId -> { name, categories, notes: [{text,time,public}], feed: [] }
  feed: []   // public notes from all users
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

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data }));
});

/* ---------- API ---------- */
// Benutzer anlegen
app.post("/user/add", (req, res) => {
  const id = Date.now().toString(36);
  data.users[id] = { name: req.body.name || "User", categories: {}, notes: [], feed: [] };
  saveData();
  res.json({ id });
});

// Benutzer löschen
app.post("/user/delete", (req, res) => {
  delete data.users[req.body.id];
  saveData();
  res.sendStatus(200);
});

// Eigene Notiz erstellen
app.post("/note/add", (req, res) => {
  const { userId, text, category, isPublic } = req.body;
  if (!data.users[userId]) return res.sendStatus(400);

  const note = { text, time: Date.now(), category, public: !!isPublic, comments: [] };
  data.users[userId].notes.unshift(note);

  if (note.public) {
    data.feed.unshift({ ...note, user: data.users[userId].name, userId });
  }

  saveData();
  res.sendStatus(200);
});

// Notiz löschen
app.post("/note/delete", (req, res) => {
  const { userId, i } = req.body;
  if (!data.users[userId]) return res.sendStatus(400);

  const note = data.users[userId].notes.splice(i, 1)[0];
  if (note && note.public) {
    data.feed = data.feed.filter(f => f.time !== note.time || f.userId !== userId);
  }

  saveData();
  res.sendStatus(200);
});

// Kommentar hinzufügen
app.post("/note/comment", (req, res) => {
  const { userId, noteTime, comment, noteOwnerId } = req.body;
  if (!data.users[noteOwnerId]) return res.sendStatus(400);

  const note = data.users[noteOwnerId].notes.find(n => n.time === noteTime);
  if (!note) return res.sendStatus(400);

  note.comments.push({ text: comment, author: data.users[userId].name, time: Date.now() });
  saveData();
  res.sendStatus(200);
});

// Kategorie erstellen
app.post("/cat/add", (req, res) => {
  const { userId, name } = req.body;
  if (!data.users[userId]) return res.sendStatus(400);
  if (!data.users[userId].categories[name]) {
    data.users[userId].categories = { [name]: [], ...data.users[userId].categories };
    saveData();
  }
  res.sendStatus(200);
});

// Kategorie löschen
app.post("/cat/delete", (req, res) => {
  const { userId, name } = req.body;
  if (!data.users[userId]) return res.sendStatus(400);
  delete data.users[userId].categories[name];
  saveData();
  res.sendStatus(200);
});

// Feed & eigene Daten abrufen
app.get("/data", (req, res) => {
  res.json(data);
});

// Backup export
app.get("/backup", (req, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=backup.json");
  res.send(JSON.stringify(data, null, 2));
});

/* ---------- UI ---------- */
app.get("/", (_, res) => {
res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Social Notes</title>
<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee;height:100vh;display:flex;flex-direction:column;}
#menu{position:fixed;top:0;left:-220px;width:220px;height:100%;background:#1e1e1e;transition:0.3s;padding:10px;display:flex;flex-direction:column;gap:10px;z-index:1000;}
#menu button{background:#2c2c2c;color:#fff;border:none;padding:8px;border-radius:6px;text-align:left;}
#hamburger{position:fixed;top:10px;left:10px;z-index:1100;font-size:24px;cursor:pointer;}
.tab{flex:1;padding:10px;overflow:auto;}
textarea{width:100%;padding:10px;border-radius:6px;background:#121212;color:#eee;border:1px solid #333;}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px;}
.comment{font-size:12px;color:#aaa;margin-left:10px;}
</style>
</head>
<body>

<div id="hamburger">☰</div>
<div id="menu">
<button onclick="showTab('quick')">Quick Notes</button>
<button onclick="showTab('categories')">Kategorien</button>
<button onclick="showTab('feed')">Feed</button>
<button onclick="showTab('backup')">Backup</button>
</div>

<div id="quick" class="tab"></div>
<div id="categories" class="tab"></div>
<div id="feed" class="tab"></div>
<div id="backup" class="tab"></div>

<script>
let ws, state = {}, activeCat = null;
let userId = localStorage.getItem("userId");
if(!userId) {
  userId = prompt("Dein Name") || "User";
  fetch("/user/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:userId})})
    .then(r=>r.json()).then(j=>{ userId=j.id; localStorage.setItem("userId", userId); });
}

function connect(){
  ws = new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage = e => { state = JSON.parse(e.data).data; render(); };
}
connect();

document.getElementById("hamburger").onclick = ()=>{
  const m = document.getElementById("menu");
  m.style.left = m.style.left==="0px"?"-220px":"0px";
};

function showTab(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}
showTab("quick");

function render(){
  // Quick Notes
  const quickDiv = document.getElementById("quick");
  quickDiv.innerHTML = '<textarea id="q" placeholder="Quick Notes..."></textarea><button onclick="clearQuick()">Clear → History</button>';
  const q = document.getElementById("q");
  q.value = (state.users[userId]?.notes[0]?.text)||"";
  q.oninput = ()=> fetch("/note/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,text:q.value,category:"Quick",isPublic:false})});

  // Categories
  const catDiv = document.getElementById("categories");
  catDiv.innerHTML = '<input id="newCat" placeholder="Neue Kategorie"><button onclick="addCat()">+</button>';
  Object.keys(state.users[userId]?.categories||{}).forEach(c=>{
    catDiv.innerHTML += `<div class="item"><button onclick="openCat('${c}')">${c}</button><button onclick="delCat('${c}')">🗑</button></div>`;
  });

  // Feed
  const feedDiv = document.getElementById("feed");
  feedDiv.innerHTML = (state.feed||[]).map(f=>`<div class="item"><b>${f.user}</b>: ${f.text}<br>
    ${f.comments.map(cm=>`<div class="comment">${cm.author}: ${cm.text}</div>`).join("")}
    <input id="comment-${f.time}" placeholder="Kommentar"><button onclick="addComment('${f.userId}',${f.time})">💬</button>
    </div>`).join("");

  // Backup
  document.getElementById("backup").innerHTML = '<a href="/backup">Backup herunterladen</a>';
}

function clearQuick(){ fetch("/note/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,i:0})}); }

function addCat(){
  const v = document.getElementById("newCat").value.trim();
  if(v) fetch("/cat/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,name:v})});
}

function delCat(c){ fetch("/cat/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,name:c})}); }

function openCat(c){
  activeCat=c;
  const catDiv = document.getElementById("categories");
  catDiv.innerHTML = '<textarea id="newNote" placeholder="Neue Notiz"></textarea><button onclick="addNote()">+</button>';
  const notes = state.users[userId]?.notes.filter(n=>n.category===c)||[];
  notes.forEach((n,i)=>{ 
    catDiv.innerHTML += `<div class="item">${n.text}<button onclick="delNote(${i})">🗑</button></div>`;
  });
}

function addNote(){
  const t = document.getElementById("newNote").value;
  if(t) fetch("/note/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,text:t,category:activeCat,isPublic:false})});
}

function delNote(i){
  fetch("/note/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,i})});
}

function addComment(noteOwnerId,noteTime){
  const inp = document.getElementById(`comment-${noteTime}`);
  const t = inp.value.trim();
  if(t) fetch("/note/comment",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId,noteOwnerId,noteTime,comment:t})});
  inp.value="";
}
</script>
</body>
</html>`);});

/* ---------- START ---------- */
loadData();
server.listen(PORT, ()=>console.log("Server2 läuft stabil"));