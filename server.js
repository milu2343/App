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

// Load data from Gist
async function loadData() {
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: HEADERS });
    const gist = await res.json();
    if(!gist.files || !gist.files["notes.json"] || !gist.files["notes.json"].content) {
      // Wenn Gist leer oder ungültig
      const empty = { quickNote:"", history:[], categories:{} };
      await saveData(empty);
      return empty;
    }
    return JSON.parse(gist.files["notes.json"].content);
  } catch(e) {
    console.error("Fehler beim Laden der Daten:", e);
    // Immer leere Struktur zurückgeben, damit die App startet
    return { quickNote:"", history:[], categories:{} };
  }
}

// Save data to Gist
async function saveData(d) {
  await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: "PATCH",
    headers: { ...HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify({ files: { "notes.json": { content: JSON.stringify(d, null, 2) } } })
  });
}

/* ---------- MAIN PAGE ---------- */
app.get("/", (_, res) => {
  res.send(`<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Notes</title>
<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e;flex-wrap:wrap}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px;cursor:pointer}
button.big{font-size:16px;padding:10px 16px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
.small{font-size:12px;color:#aaa}
h3{margin-top:10px}
</style>
</head>
<body>

<script>
let allowed = false;
while(!allowed){
  let pw = prompt("Passwort eingeben:");
  if(pw === "${PASSWORD}"){
    allowed = true;
    break;
  } else {
    alert("Falsches Passwort, bitte erneut eingeben!");
  }
}
</script>

<header>
<button onclick="show('quick')">Quick</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
<input id="search" placeholder="Suche" oninput="doSearch()" style="flex:1"/>
</header>

<div id="quick" class="tab">
<div>
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<button onclick="clearQuick()">Clear</button>
</div>
<textarea id="q" placeholder="Quick Notes..."></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<script>
let activeCat=null;
let searchTerm="";
const q=document.getElementById("q");
const searchInput=document.getElementById("search");

function doSearch(){
  searchTerm=searchInput.value.toLowerCase();
  if(document.getElementById("notes").style.display!="block") return;
  loadCats();
}

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  if(id==="quick") loadQuick();
  if(id==="notes") loadCats();
  if(id==="history") loadHistory();
}
show("quick");

/* ---------- Quick Notes ---------- */
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

/* ---------- History ---------- */
async function loadHistory(){
  const d=await fetch("/data").then(r=>r.json());
  history.innerHTML=d.history.map(x=>"<div class='item'>"+x+"</div>").join("");
}

/* ---------- Categories / Notizen ---------- */
async function loadCats(){
  activeCat=null;
  const d=await fetch("/data").then(r=>r.json());
  view.innerHTML='<input id="c" placeholder="Neue Kategorie"><button onclick="addCat()">Kategorie +</button>';
  Object.keys(d.categories).filter(c=>c.toLowerCase().includes(searchTerm) || d.categories[c].some(n=>n.toLowerCase().includes(searchTerm)))
    .forEach(c=>{
    view.innerHTML+=\`<div class="item"><button class="big" onclick="openCat('\${c}')">\${c}</button>
    <button onclick="delCat('\${c}')">🗑</button></div>\`;
  });
}

function addCat(){
  const c=document.getElementById("c").value.trim();
  if(!c) return;
  fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:c})}).then(loadCats);
}

function delCat(c){
  if(confirm("Kategorie löschen? Alle Notizen gehen verloren!")) fetch("/delcat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:c})}).then(loadCats);
}

async function openCat(c){
  activeCat=c;
  const d=await fetch("/data").then(r=>r.json());
  const notes=d.categories[c];
  view.innerHTML=\`<button onclick="loadCats()">⬅ Zurück</button><h3>\${c}</h3><button class="big" onclick="newNote()">➕ Notiz erstellen</button>\`;
  notes.forEach((n,i)=>{
    if(searchTerm && !n.toLowerCase().includes(searchTerm)) return;
    view.innerHTML+=\`<div class="item">\${n}
      <button onclick="edit(\${i})">✏️</button>
      <button onclick="del(\${i})">🗑</button></div>\`;
  });
}

function newNote(){
  const t=prompt("Notiz schreiben");
  if(t) fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,text:t})}).then(()=>openCat(activeCat));
}

function edit(i){
  const t=prompt("Bearbeiten");
  if(t!==null) fetch("/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i,text:t})}).then(()=>openCat(activeCat));
}

function del(i){
  if(confirm("Notiz löschen?")) fetch("/del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})}).then(()=>openCat(activeCat));
}
</script>
</body></html>`);
});

/* ---------- API ---------- */
app.get("/data", async(_,s)=>s.json(await loadData()));

app.post("/quick", async(r,s)=>{
  const d=await loadData();
  d.quickNote=r.body.text;
  await saveData(d); s.sendStatus(200);
});

app.post("/clear", async(_,s)=>{
  const d=await loadData();
  if(d.quickNote) d.history.unshift(d.quickNote);
  d.quickNote=""; d.history=d.history.slice(0,50);
  await saveData(d); s.sendStatus(200);
});

app.post("/cat", async(r,s)=>{
  const d=await loadData();
  if(!d.categories[r.body.name]) d.categories[r.body.name]=[];
  await saveData(d); s.sendStatus(200);
});

app.post("/delcat", async(r,s)=>{
  const d=await loadData();
  delete d.categories[r.body.cat];
  await saveData(d); s.sendStatus(200);
});

app.post("/note", async(r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat].unshift(r.body.text);
  await saveData(d); s.sendStatus(200);
});

app.post("/edit", async(r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat][r.body.i]=r.body.text;
  await saveData(d); s.sendStatus(200);
});

app.post("/del", async(r,s)=>{
  const d=await loadData();
  d.categories[r.body.cat].splice(r.body.i,1);
  await saveData(d); s.sendStatus(200);
});

app.listen(PORT,()=>console.log("Server läuft"));