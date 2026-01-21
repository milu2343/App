// server.js
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;
const DATA_FILE = "./notes.json";

app.use(express.json());

// ---------- Daten ----------
let data = { quickNote: "", history: [], categories: {} };

// ---------- Laden / Speichern ----------
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE);
      data = JSON.parse(raw);
    }
  } catch (e) { console.error("Fehler beim Laden:", e); }
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (e) { console.error("Fehler beim Speichern:", e); }
  broadcast();
}

// ---------- WebSocket Live-Sync ----------
function broadcast() {
  const msg = JSON.stringify({ type: "sync", data });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data }));

  ws.on("message", async msg => {
    const m = JSON.parse(msg);

    // Quick Notes
    if (m.type === "quick") {
      if (data.quickNote !== m.text) {
        if (data.quickNote) {
          data.history.unshift({ text: data.quickNote, time: Date.now() });
          if (data.history.length > 50) data.history = data.history.slice(0, 50);
        }
        data.quickNote = m.text;
        saveData();
      }
    }

    // Kategorien
    if (m.type === "addCat" && !data.categories[m.name]) {
      data.categories = { [m.name]: [], ...data.categories }; // neue Kategorie oben
      saveData();
    }
    if (m.type === "delCat") {
      delete data.categories[m.cat];
      saveData();
    }

    // Notizen
    if (m.type === "addNote") {
      data.categories[m.cat].unshift({ text: m.text, time: Date.now() });
      saveData();
    }
    if (m.type === "editNote") {
      data.categories[m.cat][m.i].text = m.text;
      saveData();
    }
    if (m.type === "delNote") {
      data.categories[m.cat].splice(m.i, 1);
      saveData();
    }
  });
});

// ---------- UI ----------
app.get("/", (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Notes</title>
<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e;flex-wrap:wrap}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
button.big{font-size:16px;padding:10px 16px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px;font-size:16px}
textarea.full{height:calc(100vh - 60px)}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
h3{margin-top:10px}
.note-row{display:flex;gap:6px;margin-bottom:6px}
.note-row textarea{flex:1}
</style>
</head>
<body>

<header>
<button id="btnQuick">Quick</button>
<button id="btnNotes">Notizen</button>
<button id="btnHistory">History</button>
</header>

<div id="quick" class="tab">
<textarea id="quickText" class="full" placeholder="Quick Notes..."></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"><div id="historyView"></div></div>

<script>
const clientId = Math.random().toString(36).slice(2);
let ws;
let activeCat = null;

const quickText = document.getElementById("quickText");
const view = document.getElementById("view");
const historyView = document.getElementById("historyView");
const tabs = { quick: document.getElementById("quick"), notes: document.getElementById("notes"), history: document.getElementById("history") };

document.getElementById("btnQuick").onclick = ()=>show("quick");
document.getElementById("btnNotes").onclick = ()=>show("notes");
document.getElementById("btnHistory").onclick = ()=>show("history");

function show(id){
  Object.values(tabs).forEach(t=>t.style.display="none");
  tabs[id].style.display="block";
  render();
}

// WebSocket verbinden
function connect(){
  ws = new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage = e=>{
    const m = JSON.parse(e.data);
    if(m.type==="sync"){ window.data = m.data; render(); }
  };
}
connect();

// Render Funktion
function render(){
  if(tabs.quick.style.display==="block"){
    quickText.value = window.data.quickNote || "";
  }
  if(tabs.history.style.display==="block"){
    historyView.innerHTML = (window.data.history||[]).map(x=>"<div class='item'>"+x.text+" <small>"+new Date(x.time).toLocaleString()+"</small></div>").join("");
  }
  if(tabs.notes.style.display==="block"){
    if(activeCat) openCat(activeCat); else renderCats();
  }
}

quickText.oninput = ()=>ws.send(JSON.stringify({ type:"quick", text:quickText.value, client:clientId }));

// Categories
function renderCats(){
  view.innerHTML = '<input id="newCat" placeholder="Neue Kategorie"><button onclick="addCat()">Kategorie +</button>';
  Object.keys(window.data.categories||{}).forEach(c=>{
    view.innerHTML += '<div class="item"><button class="big" onclick="openCat(\''+c+'\')">'+c+'</button><button onclick="delCat(\''+c+'\')">🗑</button></div>';
  });
}

function addCat(){
  const c = document.getElementById("newCat").value.trim();
  if(!c) return;
  ws.send(JSON.stringify({ type:"addCat", name:c }));
}

function delCat(c){ ws.send(JSON.stringify({ type:"delCat", cat:c })); }

// Notes
function openCat(c){
  activeCat = c;
  const notes = window.data.categories[c] || [];
  view.innerHTML = '<button onclick="renderCats()">⬅ Zurück</button><h3>'+c+'</h3>';
  view.innerHTML += '<button class="big" onclick="newNote()">➕ Notiz erstellen</button>';
  notes.forEach((n,i)=>{
    view.innerHTML += '<div class="note-row"><textarea oninput="editNote('+i+',this.value)">'+n.text+'</textarea><button onclick="delNote('+i+')">🗑</button></div>';
  });
}

function newNote(){
  if(!activeCat) return;
  ws.send(JSON.stringify({ type:"addNote", cat:activeCat, text:"Neue Notiz" }));
}

function editNote(i,text){ ws.send(JSON.stringify({ type:"editNote", cat:activeCat, i, text })); }
function delNote(i){ ws.send(JSON.stringify({ type:"delNote", cat:activeCat, i })); }

</script>
</body>
</html>`);
});

// ---------- API ----------
app.get("/data", async (_, res)=>res.json(data));

// ---------- Server starten ----------
loadData();
server.listen(PORT,()=>console.log("Server läuft stabil"));