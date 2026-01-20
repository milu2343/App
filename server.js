const express = require("express");
const fetch = require("node-fetch");

const app = express();
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

/* ---------- GIST ---------- */
async function loadData() {
  try {
    const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
    const g = await r.json();
    if (!g.files || !g.files["notes.json"]) {
      await saveData(EMPTY);
      return structuredClone(EMPTY);
    }
    return JSON.parse(g.files["notes.json"].content);
  } catch {
    return structuredClone(EMPTY);
  }
}

async function saveData(d) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({
      files: { "notes.json": { content: JSON.stringify(d, null, 2) } }
    })
  });
}

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
.tab{display:none;height:calc(100vh - 60px);padding:10px}
textarea{width:100%;height:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
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

<header class="hidden" id="top">
<button onclick="show('quick')">Quick</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
</header>

<div id="quick" class="tab">
<div>
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<button onclick="clearQuick()">Clear</button>
</div>
<textarea id="quickText"></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<script>
let logged=false, data=null, activeCat=null;
const qt=document.getElementById("quickText");
const view=document.getElementById("view");

/* ---------- LOGIN ---------- */
function login(){
  if(document.getElementById("pw").value === "${PASSWORD}"){
    logged=true;
    document.getElementById("login").style.display="none";
    document.getElementById("top").classList.remove("hidden");
    show("quick");
    sync();
  } else document.getElementById("err").innerText="Falsches Passwort";
}

/* ---------- NAV ---------- */
function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
}

/* ---------- LIVE SYNC ---------- */
async function sync(){
  if(!logged) return;
  data = await fetch("/data").then(r=>r.json());
  if(document.getElementById("quick").style.display==="block") qt.value=data.quickNote||"";
  if(document.getElementById("notes").style.display==="block") loadCats();
  if(document.getElementById("history").style.display==="block") loadHistory();
  setTimeout(sync,2000);
}

/* ---------- QUICK ---------- */
qt.oninput=()=>fetch("/quick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:qt.value})});
function copy(){navigator.clipboard.writeText(qt.value)}
async function paste(){qt.value+=await navigator.clipboard.readText()}
function clearQuick(){fetch("/clear",{method:"POST"});qt.value=""}

/* ---------- HISTORY ---------- */
function loadHistory(){
  history.innerHTML=data.history.map(x=>"<div class=item>"+x+"</div>").join("");
}

/* ---------- CATEGORIES ---------- */
function loadCats(){
  activeCat=null;
  view.innerHTML='<input id="newCat" placeholder="Neue Kategorie"><button onclick="addCat()">+</button>';
  Object.keys(data.categories).forEach(c=>{
    view.innerHTML+=\`<div class=item>
    <button onclick="openCat('\${c}')">\${c}</button>
    <button onclick="delCat('\${c}')">🗑</button></div>\`;
  });
}

function addCat(){
  const n=document.getElementById("newCat").value.trim();
  if(!n) return;
  fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n})});
}

function delCat(c){
  fetch("/delcat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:c})});
}

/* ---------- NOTES ---------- */
function openCat(c){
  activeCat=c;
  view.innerHTML=\`<button onclick="loadCats()">⬅</button><h3>\${c}</h3>
  <button onclick="newNote()">➕</button>\`;
  data.categories[c].forEach((n,i)=>{
    view.innerHTML+=\`<div class=item>
    <textarea oninput="edit(\${i},this.value)">\${n}</textarea>
    <button onclick="del(\${i})">🗑</button></div>\`;
  });
}

function newNote(){
  fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,text:""})});
}

function edit(i,t){
  fetch("/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i,text:t})});
}

function del(i){
  fetch("/del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})});
}
</script>
</body></html>`);
});

/* ---------- API ---------- */
app.get("/data", async(_,r)=>r.json(await loadData()));
app.post("/quick", async(req,res)=>{const d=await loadData();d.quickNote=req.body.text;await saveData(d);res.sendStatus(200)});
app.post("/clear", async(_,res)=>{const d=await loadData();if(d.quickNote)d.history.unshift(d.quickNote);d.quickNote="";await saveData(d);res.sendStatus(200)});
app.post("/cat", async(req,res)=>{const d=await loadData();if(!d.categories[req.body.name])d.categories[req.body.name]=[];await saveData(d);res.sendStatus(200)});
app.post("/delcat", async(req,res)=>{const d=await loadData();delete d.categories[req.body.cat];await saveData(d);res.sendStatus(200)});
app.post("/note", async(req,res)=>{const d=await loadData();d.categories[req.body.cat].unshift(req.body.text);await saveData(d);res.sendStatus(200)});
app.post("/edit", async(req,res)=>{const d=await loadData();d.categories[req.body.cat][req.body.i]=req.body.text;await saveData(d);res.sendStatus(200)});
app.post("/del", async(req,res)=>{const d=await loadData();d.categories[req.body.cat].splice(req.body.i,1);await saveData(d);res.sendStatus(200)});

app.listen(PORT,()=>console.log("Server läuft"));
