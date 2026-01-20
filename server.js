const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;
const TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;
const PASSWORD = process.env.PASSWORD || "1234";

app.use(express.json());

const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json"
};

const EMPTY = {
  quickNote: "",
  quickMeta: { client: "", time: 0 },
  history: [],
  categories: {}
};

let data = structuredClone(EMPTY);

/* ---------------- GIST ---------------- */
async function loadData() {
  try {
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
    const g = await r.json();
    if (g.files && g.files["notes.json"]) {
      data = JSON.parse(g.files["notes.json"].content);
    }
  } catch {}
}

async function saveData() {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      files: { "notes.json": { content: JSON.stringify(data, null, 2) } }
    })
  });
  broadcast();
}

/* ---------------- WEBSOCKET ---------------- */
function broadcast() {
  const msg = JSON.stringify({ type: "sync", data });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data }));

  ws.on("message", async msg => {
    const m = JSON.parse(msg);

    /* ---------- QUICK NOTES ---------- */
    if (m.type === "quick") {
      if (
        m.time > data.quickMeta.time ||
        (m.time === data.quickMeta.time && m.client !== data.quickMeta.client)
      ) {
        if (data.quickNote && data.quickNote !== m.text) {
          data.history.unshift(data.quickNote);
          data.history = data.history.slice(0, 50);
        }
        data.quickNote = m.text;
        data.quickMeta = { client: m.client, time: m.time };
        await saveData();
      }
    }

    /* ---------- CATEGORIES ---------- */
    if (m.type === "addCat" && !data.categories[m.name]) {
      data.categories[m.name] = [];
      await saveData();
    }
    if (m.type === "delCat") {
      delete data.categories[m.cat];
      await saveData();
    }

    /* ---------- NOTES ---------- */
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

/* ---------------- PWA ---------------- */
app.get("/manifest.json", (_, res) => {
  res.json({
    name: "Notes",
    short_name: "Notes",
    start_url: "/",
    display: "standalone",
    background_color: "#121212",
    theme_color: "#121212",
    icons: []
  });
});

app.get("/sw.js", (_, res) => {
  res.set("Content-Type", "application/javascript");
  res.send(`
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("fetch", () => {});
`);
});

/* ---------------- UI ---------------- */
app.get("/", (_, res) => {
res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notes</title>
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#121212">
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e;flex-wrap:wrap}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
textarea.full{height:calc(100vh - 60px)}
.item{border-bottom:1px solid #333;padding:10px}
#login{display:flex;flex-direction:column;justify-content:center;align-items:center;height:100vh}
#login input,#login button{margin:10px 0;width:80%;max-width:300px}
</style>
</head>
<body>

<div id="login" class="tab" style="display:block">
<h3>Passwort</h3>
<input id="pw" type="password">
<button onclick="login()">Login</button>
<p id="err"></p>
</div>

<header id="top" class="hidden">
<button onclick="show('quick')">Quick</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
<input id="search" placeholder="Suche..." oninput="render()">
</header>

<div id="quick" class="tab">
<textarea id="quickText" class="full"></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<script>
if("serviceWorker" in navigator){navigator.serviceWorker.register("/sw.js");}
const clientId=Math.random().toString(36).slice(2);
let ws,data={},activeCat=null;

const qt=document.getElementById("quickText");
const view=document.getElementById("view");
const loginBox=document.getElementById("login");
const top=document.getElementById("top");
const pw=document.getElementById("pw");
const err=document.getElementById("err");
const search=document.getElementById("search");

function login(){
  if(pw.value==="${PASSWORD}"){
    loginBox.style.display="none";
    top.classList.remove("hidden");
    connect();
    show("quick");
  }else err.innerText="Falsches Passwort";
}

function connect(){
  ws=new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="sync"){data=m.data; render();}
  };
}

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}

function render(){
  if(quick.style.display==="block") qt.value=data.quickNote||"";
  if(history.style.display==="block")
    history.innerHTML=(data.history||[]).map(x=>"<div class=item>"+x+"</div>").join("");
  if(notes.style.display==="block") activeCat?openCat(activeCat):renderCats();
}

/* Quick Notes */
qt.oninput=()=>ws.send(JSON.stringify({type:"quick",text:qt.value,client:clientId,time:Date.now()}));

/* Categories */
function renderCats(){
  view.innerHTML='<input id="nc" placeholder="Neue Kategorie"><button onclick="addCat()">+</button>';
  Object.keys(data.categories||{}).forEach(c=>{
    view.innerHTML+=\`<div class=item><button onclick="openCat('\${c}')">\${c}</button>
    <button onclick="delCat('\${c}')">🗑</button></div>\`;
  });
}
function addCat(){ws.send(JSON.stringify({type:"addCat",name:nc.value.trim()}))}
function delCat(c){ws.send(JSON.stringify({type:"delCat",cat:c}))}

/* Notes */
function openCat(c){
  activeCat=c;
  view.innerHTML=\`<button onclick="renderCats()">⬅</button><h3>\${c}</h3><button onclick="addNote()">➕</button>\`;
  data.categories[c].forEach((n,i)=>{
    view.innerHTML+=\`<div class=item><textarea oninput="editNote(\${i},this.value)">\${n}</textarea>
    <button onclick="delNote(\${i})">🗑</button></div>\`;
  });
}
function addNote(){ws.send(JSON.stringify({type:"addNote",cat:activeCat,text:""}))}
function editNote(i,t){ws.send(JSON.stringify({type:"editNote",cat:activeCat,i,text:t}))}
function delNote(i){ws.send(JSON.stringify({type:"delNote",cat:activeCat,i}))}
</script>
</body>
</html>`);
});

/* ---------------- START ---------------- */
loadData().then(()=>server.listen(PORT,()=>console.log("Server läuft stabil")));
