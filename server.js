import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import fs from "fs";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;

app.use(express.json());

let data = {
  quickNote: "",
  history: [],
  categories: {}
};

// ---------------- WebSocket ----------------
function broadcast() {
  const msg = JSON.stringify({ type: "sync", data });
  wss.clients.forEach(c => {
    if(c.readyState === 1) c.send(msg);
  });
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data }));
  ws.on("message", async msg => {
    const m = JSON.parse(msg);

    // Quick Notes
    if(m.type === "quick"){
      if(m.text !== data.quickNote){
        if(data.quickNote && !data.history.includes(data.quickNote)){
          data.history.unshift(data.quickNote);
          data.history = data.history.slice(0,50);
        }
        data.quickNote = m.text;
        broadcast();
      }
    }

    // Categories
    if(m.type === "addCat" && !data.categories[m.name]){
      data.categories[m.name] = [];
      broadcast();
    }
    if(m.type === "delCat"){
      delete data.categories[m.cat];
      broadcast();
    }
    if(m.type === "renameCat" && data.categories[m.oldName]){
      data.categories[m.newName] = data.categories[m.oldName];
      delete data.categories[m.oldName];
      broadcast();
    }

    // Notes
    if(m.type === "addNote" && data.categories[m.cat]){
      data.categories[m.cat].unshift(m.text);
      broadcast();
    }
    if(m.type === "editNote" && data.categories[m.cat]){
      data.categories[m.cat][m.i] = m.text;
      broadcast();
    }
    if(m.type === "delNote" && data.categories[m.cat]){
      data.categories[m.cat].splice(m.i,1);
      broadcast();
    }
  });
});

// ---------------- Backup ----------------
app.get("/backup", (_, res) => {
  res.setHeader("Content-Disposition","attachment; filename=notes_backup.json");
  res.send(JSON.stringify(data,null,2));
});

// ---------------- UI ----------------
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
textarea,input{width:100%;border:1px solid #333;padding:10px;border-radius:6px;background:#121212;color:#eee;font-size:16px}
textarea.full{height:calc(100vh - 60px)}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
.small{font-size:12px;color:#aaa}
h3{margin-top:10px}
</style>
</head>
<body>

<header>
<button onclick="show('quick')">Quick</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
<button onclick="downloadBackup()">Backup</button>
</header>

<div id="quick" class="tab">
<div>
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<button onclick="clearQuick()">Clear</button>
</div>
<textarea id="q" class="full" placeholder="Quick Notes..."></textarea>
</div>

<div id="notes" class="tab">
<div id="view"></div>
</div>

<div id="history" class="tab"></div>

<script>
let ws;
let activeCat = null;

function connect(){
  ws = new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if(m.type === "sync"){ window.data = m.data; render(); }
  };
}
connect();

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}

const qt = document.getElementById("q");
qt.oninput = () => {
  ws.send(JSON.stringify({type:"quick", text:qt.value}));
};

function render(){
  if(document.getElementById("quick").style.display==="block") qt.value = window.data.quickNote || "";
  
  // History
  if(document.getElementById("history").style.display==="block"){
    const h = window.data.history || [];
    history.innerHTML = h.map((t,i) => 
      \`<div class="item"><textarea oninput="editHistory(\${i},this.value)">\${t}</textarea>
      <button onclick="delHistory(\${i})">🗑</button></div>\`
    ).join("");
  }

  // Categories
  if(document.getElementById("notes").style.display==="block"){
    if(activeCat) renderCat(activeCat);
    else renderCats();
  }
}

function renderCats(){
  const view = document.getElementById("view");
  view.innerHTML = '<input id="nc" placeholder="Neue Kategorie"><button onclick="addCat()">+</button>';
  Object.keys(window.data.categories).reverse().forEach(c=>{
    view.innerHTML += \`<div class="item"><button onclick="openCat('\${c}')">\${c}</button>
      <button onclick="renameCat('\${c}')">✏️</button>
      <button onclick="delCat('\${c}')">🗑</button></div>\`;
  });
}

function addCat(){
  const val = document.getElementById("nc").value.trim();
  if(!val) return;
  ws.send(JSON.stringify({type:"addCat", name:val}));
  document.getElementById("nc").value="";
}

function delCat(c){ ws.send(JSON.stringify({type:"delCat",cat:c})); }
function renameCat(c){
  const n = prompt("Neuer Kategoriename:",c);
  if(n && n!==c) ws.send(JSON.stringify({type:"renameCat",oldName:c,newName:n}));
}

function openCat(c){
  activeCat = c;
  renderCat(c);
}

function renderCat(c){
  const view = document.getElementById("view");
  view.innerHTML = '<button onclick="activeCat=null;renderCats()">⬅ Zurück</button><h3>'+c+'</h3>';
  view.innerHTML += '<button onclick="addNote()">➕ Notiz</button>';
  (window.data.categories[c]||[]).forEach((t,i)=>{
    view.innerHTML += \`<div class="item"><textarea oninput="editNote(\${i},this.value)">\${t}</textarea>
    <button onclick="delNote(\${i})">🗑</button></div>\`;
  });
}

function addNote(){
  const t = prompt("Notiz eingeben:");
  if(t) ws.send(JSON.stringify({type:"addNote", cat:activeCat, text:t}));
}

function editNote(i,text){ ws.send(JSON.stringify({type:"editNote",cat:activeCat,i,text:text})); }
function delNote(i){ ws.send(JSON.stringify({type:"delNote",cat:activeCat,i})); }

// History bearbeiten
function editHistory(i,text){ 
  window.data.history[i] = text; 
  qt.value = text; 
  ws.send(JSON.stringify({type:"quick",text:text}));
}
function delHistory(i){ window.data.history.splice(i,1); render(); }

// Quick Buttons
function copy(){navigator.clipboard.writeText(qt.value);}
function paste(){navigator.clipboard.readText().then(t=>qt.value+=t); ws.send(JSON.stringify({type:"quick",text:qt.value}));}
function clearQuick(){ 
  if(qt.value && !window.data.history.includes(qt.value)){
    window.data.history.unshift(qt.value);
    window.data.history = window.data.history.slice(0,50);
  }
  qt.value=""; 
  ws.send(JSON.stringify({type:"quick",text:""}));
}

// Backup
function downloadBackup(){
  window.location.href="/backup";
}

show("quick");
</script>
</body></html>`);
});

server.listen(PORT,()=>console.log("Server läuft stabil"));