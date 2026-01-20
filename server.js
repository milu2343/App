const express = require("express");
const fetch = (...args) => import("node-fetch").then(({default: fetch}) => fetch(...args));
const fetch = (...a)=>import("node-fetch").then(({default:f})=>f(...a));

const app = express();
const PORT = process.env.PORT || 3001;
@@ -9,42 +9,41 @@ const GIST_ID = process.env.GIST_ID;

app.use(express.json());

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Accept": "application/vnd.github+json"
const HEADERS = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: "application/vnd.github+json"
};

async function loadData(){
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers });
  const r = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
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
async function saveData(d){
  await fetch(`https://api.github.com/gists/${GIST_ID}`,{
    method:"PATCH",
    headers:{...HEADERS,"Content-Type":"application/json"},
    body:JSON.stringify({files:{ "notes.json":{content:JSON.stringify(d,null,2)} }})
  });
}

/* ---------- PAGE ---------- */
app.get("/", (req, res) => {
res.send(`<!DOCTYPE html>
<html>
<head>
/* ---------- MAIN PAGE ---------- */
app.get("/",(_,res)=>{
res.send(`<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Notes</title>
<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee}
body{margin:0;font-family:sans-serif;background:#121212;color:#eee;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
.tab{display:none;padding:10px}
textarea{width:100%;height:70vh;background:#121212;color:#eee;border:1px solid #333;padding:10px}
.item{border-bottom:1px solid #333;padding:10px}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
button.big{font-size:16px;padding:10px 16px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea{width:100%;height:70vh;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
.small{font-size:12px;color:#aaa}
h3{margin-top:10px}
</style>
</head>
<body>
@@ -56,10 +55,12 @@ textarea{width:100%;height:70vh;background:#121212;color:#eee;border:1px solid #
</header>

<div id="quick" class="tab">
<div>
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<button onclick="clearQuick()">Clear</button>
<textarea id="q"></textarea>
</div>
<textarea id="q" placeholder="Quick Notes..."></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
@@ -78,7 +79,7 @@ function show(id){
}
show("quick");

/* Quick */
/* ---------- Quick Notes ---------- */
async function loadQuick(){
  const d=await fetch("/data").then(r=>r.json());
  q.value=d.quickNote;
@@ -91,100 +92,100 @@ function clearQuick(){
  q.value="";
}

/* History */
/* ---------- History ---------- */
async function loadHistory(){
  const d=await fetch("/data").then(r=>r.json());
  history.innerHTML=d.history.map(x=>"<div class='item'>"+x+"</div>").join("");
}

/* Categories */
/* ---------- Categories / Notizen ---------- */
async function loadCats(){
  activeCat=null;
  const d=await fetch("/data").then(r=>r.json());
  view.innerHTML='<input id="c"><button onclick="addCat()">+</button>';
  view.innerHTML='<input id="c" placeholder="Neue Kategorie"><button onclick="addCat()">Kategorie +</button>';
  Object.keys(d.categories).forEach(c=>{
    view.innerHTML+=\`<div class="item"><button onclick="openCat('\${c}')">\${c}</button></div>\`;
    view.innerHTML+=\`<div class="item"><button class="big" onclick="openCat('\${c}')">\${c}</button></div>\`;
  });
}

function addCat(){
  fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:c.value})})
  const c = document.getElementById("c").value.trim();
  if(!c) return;
  fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:c})})
    .then(loadCats);
}

async function openCat(c){
  activeCat=c;
  const d=await fetch("/data").then(r=>r.json());
  view.innerHTML=\`<button onclick="loadCats()">⬅</button><h3>\${c}</h3><button onclick="newNote()">➕</button>\`;
  d.categories[c].forEach((n,i)=>{
  const notes = d.categories[c];
  view.innerHTML=\`<button onclick="loadCats()">⬅ Zurück</button><h3>\${c}</h3><button class="big" onclick="newNote()">➕ Notiz erstellen</button>\`;
  notes.forEach((n,i)=>{
    view.innerHTML+=\`<div class="item">\${n}
      <button onclick="edit(\${i})">✏️</button>
      <button onclick="del(\${i})">🗑</button>
    </div>\`;
      </div>\`;
  });
}

function newNote(){
  const t=prompt("Notiz");
  const t=prompt("Notiz schreiben");
  if(t) fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,text:t})})
    .then(()=>openCat(activeCat));
}

function edit(i){
  const t=prompt("Neu");
  const t=prompt("Bearbeiten");
  if(t!==null) fetch("/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i,text:t})})
    .then(()=>openCat(activeCat));
}

function del(i){
  fetch("/del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})})
  if(confirm("Notiz löschen?")) fetch("/del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})})
    .then(()=>openCat(activeCat));
}
</script>
</body>
</html>`);
</body></html>`);
});

/* ---------- API ---------- */
app.get("/data", async (r,s)=>s.json(await loadData()));
app.get("/data", async(_,s)=>s.json(await loadData()));

app.post("/quick", async (r,s)=>{
app.post("/quick", async(r,s)=>{
  const d=await loadData();
  d.quickNote=r.body.text;
  await saveData(d);
  s.sendStatus(200);
  await saveData(d); s.sendStatus(200);
});

app.post("/clear", async (r,s)=>{
app.post("/clear", async(_,s)=>{
  const d=await loadData();
  if(d.quickNote) d.history.unshift(d.quickNote);
  d.quickNote="";
  d.history=d.history.slice(0,50);
  await saveData(d);
  s.sendStatus(200);
  d.quickNote=""; d.history=d.history.slice(0,50);
  await saveData(d); s.sendStatus(200);
});

app.post("/cat", async (r,s)=>{
app.post("/cat", async(r,s)=>{
  const d=await loadData();
  d.categories[r.body.name]=[];
  await saveData(d);
  s.sendStatus(200);
  if(!d.categories[r.body.name]) d.categories[r.body.name]=[];
  await saveData(d); s.sendStatus(200);
});

app.post("/note", async (r,s)=>{
app.post("/note", async(r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat].unshift(r.body.text);
  await saveData(d);
  s.sendStatus(200);
  await saveData(d); s.sendStatus(200);
});

app.post("/edit", async (r,s)=>{
app.post("/edit", async(r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat][r.body.i]=r.body.text;
  await saveData(d);
  s.sendStatus(200);
  await saveData(d); s.sendStatus(200);
});

app.post("/del", async (r,s)=>{
app.post("/del", async(r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat].splice(r.body.i,1);
  await saveData(d);
  s.sendStatus(200);
  await saveData(d); s.sendStatus(200);
});

app.listen(PORT,()=>console.log("Server läuft"));
