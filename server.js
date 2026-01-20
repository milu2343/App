import express from "express";
import http from "http";
import WebSocket from "ws";
import fetch from "node-fetch";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;
const TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

app.use(express.json());

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json"
};

// ---------------- Daten ----------------
let data = { quickNote: "", quickMeta: { client: "", time: 0 }, history: [], categories: {} };

// ---------------- Gist Load/Save ----------------
async function loadData() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
    const gist = await res.json();
    if (gist.files && gist.files["notes.json"] && gist.files["notes.json"].content) {
      data = JSON.parse(gist.files["notes.json"].content);
    }
  } catch (err) {
    console.error("Gist load error:", err);
  }
}

async function saveData() {
  try {
    await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: { ...HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ files: { "notes.json": { content: JSON.stringify(data, null, 2) } } })
    });
  } catch (err) {
    console.error("Gist save error:", err);
  }
  broadcast();
}

// ---------------- WebSocket ----------------
function broadcast() {
  const msg = JSON.stringify({ type: "sync", data });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data }));

  ws.on("message", async msg => {
    const m = JSON.parse(msg);

    if (m.type === "quick") {
      if (m.time > data.quickMeta.time || (m.time === data.quickMeta.time && m.client !== data.quickMeta.client)) {
        if (data.quickNote && data.quickNote !== m.text) {
          data.history.unshift(data.quickNote);
          data.history = data.history.slice(0, 50);
        }
        data.quickNote = m.text;
        data.quickMeta = { client: m.client, time: m.time };
        await saveData();
      }
    }

    if (m.type === "addCat" && !data.categories[m.name]) {
      data.categories[m.name] = [];
      await saveData();
    }
    if (m.type === "delCat") {
      delete data.categories[m.cat];
      await saveData();
    }

    if (m.type === "addNote") {
      data.categories[m.cat].unshift(m.text);
      await saveData();
    }
    if (m.type === "editNote") {
      data.categories[m.cat][m.i] = m.text;
      await saveData();
    }
    if (m.type === "delNote") {
      data.categories[m.cat].splice(m.i, 1);
      await saveData();
    }
  });
});

// ---------------- PWA ----------------
app.get("/manifest.json", (_, res) => res.json({
  name: "Notes",
  short_name: "Notes",
  start_url: "/",
  display: "standalone",
  background_color: "#121212",
  theme_color: "#121212",
  icons: []
}));

app.get("/sw.js", (_, res) => {
  res.set("Content-Type", "application/javascript");
  res.send(`
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("fetch", () => {});
`);
});

// ---------------- API für Polling ----------------
app.get("/data", (_, res) => res.json(data));

// ---------------- UI ----------------
app.get("/", (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Notes</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#121212">
<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee;height:100vh;overflow:hidden}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e;flex-wrap:wrap}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
button.big{font-size:16px;padding:10px 16px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px;font-size:16px}
textarea.full{height:calc(100vh - 60px)}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
</style>
</head>
<body>

<header id="top">
<button id="btnQuick">Quick</button>
<button id="btnNotes">Notizen</button>
<button id="btnHistory">History</button>
<input id="search" placeholder="Suche..." oninput="render()">
</header>

<div id="quick" class="tab">
<textarea id="quickText" class="full" placeholder="Quick Notes..."></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<script>
if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js");}

let clientId = Math.random().toString(36).slice(2);
let ws, activeCat = null;
let data = {quickNote:"",history:[],categories:{}};

const qt = document.getElementById("quickText");
const view = document.getElementById("view");
const historyDiv = document.getElementById("history");

const btnQuick = document.getElementById("btnQuick");
const btnNotes = document.getElementById("btnNotes");
const btnHistory = document.getElementById("btnHistory");

btnQuick.onclick = ()=>show('quick');
btnNotes.onclick = ()=>show('notes');
btnHistory.onclick = ()=>show('history');

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}

// --------- WebSocket + Polling fallback ---------
function connect(){
  ws = new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage = e=>{
    const m = JSON.parse(e.data);
    if(m.type==="sync"){ data = m.data; render(); }
  };
  ws.onclose = ()=>{
    console.log("WS getrennt, starte Polling fallback");
    setInterval(fetchData,2000);
  };
}

// Polling fallback
async function fetchData(){
  try{
    const r = await fetch("/data");
    data = await r.json();
    render();
  } catch(e){ console.error(e); }
}

// --------- Rendering ---------
qt.oninput = ()=> ws.send(JSON.stringify({type:"quick",text:qt.value,client:clientId,time:Date.now()}));

function render(){
  if(document.getElementById("quick").style.display==="block") qt.value = data.quickNote || "";
  if(document.getElementById("history").style.display==="block")
    historyDiv.innerHTML = (data.history||[]).map(x=>"<div class='item'>"+x+"</div>").join("");
  if(document.getElementById("notes").style.display==="block")
    activeCat ? openCat(activeCat) : renderCats();
}

function renderCats(){
  view.innerHTML='<input id="nc" placeholder="Neue Kategorie"><button onclick="addCat()">Kategorie +</button>';
  Object.keys(data.categories||{}).forEach(c=>{
    view.innerHTML+='<div class="item"><button class="big" onclick="openCat(\''+c+'\')">'+c+'</button><button onclick="delCat(\''+c+'\')">🗑</button></div>';
  });
}

function addCat(){
  const val = document.getElementById("nc").value.trim();
  if(val) ws.send(JSON.stringify({type:"addCat",name:val}));
}

function delCat(c){ ws.send(JSON.stringify({type:"delCat",cat:c})); }

function openCat(c){
  activeCat = c;
  view.innerHTML='<button onclick="renderCats()">⬅ Zurück</button><h3>'+c+'</h3><button class="big" onclick="addNote()">➕ Notiz erstellen</button>';
  (data.categories[c]||[]).forEach((n,i)=>{
    view.innerHTML+='<div class="item"><textarea oninput="editNote('+i+',this.value)">'+n+'</textarea><button onclick="delNote('+i+')">🗑</button></div>';
  });
}

function addNote(){ ws.send(JSON.stringify({type:"addNote",cat:activeCat,text:""})); }
function editNote(i,t){ ws.send(JSON.stringify({type:"editNote",cat:activeCat,i,text:t})); }
function delNote(i){ ws.send(JSON.stringify({type:"delNote",cat:activeCat,i})); }

// Start
connect();
show('quick');
</script>
</body>
</html>`);
});

// ---------------- START ----------------
loadData().then(()=>server.listen(PORT,()=>console.log("Server läuft stabil")));
