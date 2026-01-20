const express = require("express");
const fetch = require("node-fetch");
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

const EMPTY = { quickNote: "", history: [], categories: {} };

let cachedData = structuredClone(EMPTY);

/* ---------- GIST ---------- */
async function loadData() {
  try {
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
    const g = await r.json();
    if (!g.files || !g.files["notes.json"]) return EMPTY;
    cachedData = JSON.parse(g.files["notes.json"].content);
    return cachedData;
  } catch {
    return cachedData;
  }
}

async function saveData(d) {
  cachedData = d;
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ files: { "notes.json": { content: JSON.stringify(d, null, 2) } } })
  });
  broadcast();
}

/* ---------- WEBSOCKET ---------- */
function broadcast() {
  const msg = JSON.stringify({ type: "sync", data: cachedData });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data: cachedData }));
});

/* ---------- UI ---------- */
app.get("/", (_, res) => {
res.send(`<!DOCTYPE html><html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notes</title>
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
textarea.big{height:calc(100vh - 120px)}
.item{border-bottom:1px solid #333;padding:10px}
.hidden{display:none}
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
<textarea id="quickText" class="big"></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<script>
let ws, data={}, activeCat=null;
const qt=document.getElementById("quickText");
const view=document.getElementById("view");
const search=document.getElementById("search");

/* ---------- LOGIN ---------- */
function login(){
  if(pw.value === "${PASSWORD}"){
    loginBox.style.display="none";
    top.classList.remove("hidden");
    show("quick");
    connect();
  } else err.innerText="Falsches Passwort";
}
const loginBox=document.getElementById("login");
const top=document.getElementById("top");
const pw=document.getElementById("pw");
const err=document.getElementById("err");

/* ---------- WS ---------- */
function connect(){
  ws=new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="sync"){data=m.data; render();}
  };
}

/* ---------- NAV ---------- */
function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}

/* ---------- RENDER ---------- */
function render(){
  if(quick.style.display==="block") qt.value=data.quickNote||"";
  if(notes.style.display==="block") renderCats();
  if(history.style.display==="block")
    history.innerHTML=data.history.map(x=>"<div class=item>"+x+"</div>").join("");
}

/* ---------- QUICK ---------- */
qt.oninput=()=>send({type:"quick",text:qt.value});

/* ---------- SEARCH ---------- */
function match(t){return t.toLowerCase().includes(search.value.toLowerCase());}

/* ---------- CATEGORIES ---------- */
function renderCats(){
  view.innerHTML=\`
  <input id="newCat" placeholder="Neue Kategorie">
  <button onclick="addCat()">+</button>\`;
  Object.keys(data.categories||{})
    .filter(c=>match(c)||data.categories[c].some(match))
    .forEach(c=>{
      view.innerHTML+=\`
      <div class=item>
        <button onclick="openCat('\${c}')">\${c}</button>
        <button onclick="send({type:'delcat',cat:'\${c}'})">🗑</button>
      </div>\`;
    });
}

function addCat(){
  const n=newCat.value.trim();
  if(n) send({type:"cat",name:n});
}

/* ---------- NOTES ---------- */
function openCat(c){
  activeCat=c;
  view.innerHTML=\`<button onclick="renderCats()">⬅</button><h3>\${c}</h3>
  <button onclick="send({type:'note',cat:'\${c}',text:''})">➕</button>\`;
  data.categories[c].forEach((n,i)=>{
    if(search.value && !match(n)) return;
    view.innerHTML+=\`
    <div class=item>
      <textarea oninput="send({type:'edit',cat:'\${c}',i:\${i},text:this.value})">\${n}</textarea>
      <button onclick="send({type:'del',cat:'\${c}',i:\${i}})">🗑</button>
    </div>\`;
  });
}

/* ---------- SEND ---------- */
function send(o){ws.readyState===1&&ws.send(JSON.stringify(o));}
</script>
</body></html>`);
});

/* ---------- API ---------- */
wss.on("connection", ws=>{
  ws.on("message", async msg=>{
    const m=JSON.parse(msg);
    const d=cachedData;
    if(m.type==="quick") d.quickNote=m.text;
    if(m.type==="cat" && !d.categories[m.name]) d.categories[m.name]=[];
    if(m.type==="delcat") delete d.categories[m.cat];
    if(m.type==="note") d.categories[m.cat].unshift(m.text);
    if(m.type==="edit") d.categories[m.cat][m.i]=m.text;
    if(m.type==="del") d.categories[m.cat].splice(m.i,1);
    await saveData(d);
  });
});

server.listen(PORT,()=>console.log("Server läuft mit WebSocket"));
