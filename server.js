const express = require("express");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));

const app = express();
const PORT = process.env.PORT || 3001;

const TOKEN = process.env.GITHUB_TOKEN;
const GIST_ID = process.env.GIST_ID;

app.use(express.json());

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Accept": "application/vnd.github+json"
};

async function loadData(){
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
  const j = await r.json();
  return JSON.parse(j.files["notes.json"].content);
}

async function saveData(data){
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type":"application/json" },
    body: JSON.stringify({
      files: { "notes.json": { content: JSON.stringify(data, null, 2) } }
    })
  });
}

/* ---------- PAGE ---------- */
app.get("/", (req, res) => {
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Notes</title>
<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
.tab{display:none;padding:10px}
textarea{width:100%;height:70vh;background:#121212;color:#eee;border:1px solid #333;padding:10px}
.item{border-bottom:1px solid #333;padding:10px}
</style>
</head>
<body>

<header>
<button onclick="show('quick')">Quick</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
</header>

<div id="quick" class="tab">
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<button onclick="clearQuick()">Clear</button>
<textarea id="q"></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<script>
let activeCat=null;
const q=document.getElementById("q");

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  if(id==="quick") loadQuick();
  if(id==="notes") loadCats();
  if(id==="history") loadHistory();
}
show("quick");

/* Quick */
async function loadQuick(){
  const d=await fetch("/data").then(r=>r.json());
  q.value=d.quickNote;
}
q.oninput=()=>fetch("/quick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:q.value})});
function copy(){navigator.clipboard.writeText(q.value)}
async function paste(){q.value+=await navigator.clipboard.readText()}
function clearQuick(){
  fetch("/clear",{method:"POST"});
  q.value="";
}

/* History */
async function loadHistory(){
  const d=await fetch("/data").then(r=>r.json());
  history.innerHTML=d.history.map(x=>"<div class='item'>"+x+"</div>").join("");
}

/* Categories */
async function loadCats(){
  activeCat=null;
  const d=await fetch("/data").then(r=>r.json());
  view.innerHTML='<input id="c"><button onclick="addCat()">+</button>';
  Object.keys(d.categories).forEach(c=>{
    view.innerHTML+=\`<div class="item"><button onclick="openCat('\${c}')">\${c}</button></div>\`;
  });
}
function addCat(){
  fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:c.value})})
    .then(loadCats);
}
async function openCat(c){
  activeCat=c;
  const d=await fetch("/data").then(r=>r.json());
  view.innerHTML=\`<button onclick="loadCats()">⬅</button><h3>\${c}</h3><button onclick="newNote()">➕</button>\`;
  d.categories[c].forEach((n,i)=>{
    view.innerHTML+=\`<div class="item">\${n}
      <button onclick="edit(\${i})">✏️</button>
      <button onclick="del(\${i})">🗑</button>
    </div>\`;
  });
}
function newNote(){
  const t=prompt("Notiz");
  if(t) fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,text:t})})
    .then(()=>openCat(activeCat));
}
function edit(i){
  const t=prompt("Neu");
  if(t!==null) fetch("/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i,text:t})})
    .then(()=>openCat(activeCat));
}
function del(i){
  fetch("/del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})})
    .then(()=>openCat(activeCat));
}
</script>
</body>
</html>`);
});

/* ---------- API ---------- */
app.get("/data", async (r,s)=>s.json(await loadData()));

app.post("/quick", async (r,s)=>{
  const d=await loadData();
  d.quickNote=r.body.text;
  await saveData(d);
  s.sendStatus(200);
});

app.post("/clear", async (r,s)=>{
  const d=await loadData();
  if(d.quickNote) d.history.unshift(d.quickNote);
  d.quickNote="";
  d.history=d.history.slice(0,50);
  await saveData(d);
  s.sendStatus(200);
});

app.post("/cat", async (r,s)=>{
  const d=await loadData();
  d.categories[r.body.name]=[];
  await saveData(d);
  s.sendStatus(200);
});

app.post("/note", async (r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat].unshift(r.body.text);
  await saveData(d);
  s.sendStatus(200);
});

app.post("/edit", async (r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat][r.body.i]=r.body.text;
  await saveData(d);
  s.sendStatus(200);
});

app.post("/del", async (r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat].splice(r.body.i,1);
  await saveData(d);
  s.sendStatus(200);
});

app.listen(PORT,()=>console.log("Server läuft"));