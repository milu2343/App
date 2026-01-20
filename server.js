const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

const NOTE_FILE = "note.txt";
const HISTORY_FILE = "history.json";
const CATEGORY_FILE = "categories.json";

/* ---------- Helpers ---------- */
const read = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : d;
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d));

/* ---------- MAIN PAGE ---------- */
app.get("/", (req, res) => {
res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notes</title>

<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
button.big{font-size:16px;padding:10px 16px}
.tab{display:none;height:calc(100vh - 60px);padding:10px}
textarea{width:100%;height:calc(100% - 50px);background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
.item{border-bottom:1px solid #333;padding:10px}
.small{font-size:12px;color:#aaa}
h3{margin-top:10px}
</style>
</head>

<body>

<header>
<button onclick="show('quick')">Quick Notes</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
</header>

<!-- QUICK NOTES -->
<div id="quick" class="tab">
  <div>
    <button onclick="copy()">Copy</button>
    <button onclick="paste()">Paste</button>
    <button onclick="clearQuick()">Clear</button>
  </div>
  <textarea id="quickText" placeholder="Quick Notes..."></textarea>
</div>

<!-- NOTIZEN -->
<div id="notes" class="tab">
  <div id="notesView"></div>
</div>

<!-- HISTORY -->
<div id="history" class="tab"></div>

<script>
const quick = document.getElementById("quickText");
let lastText = "";
let currentCategory = null;

/* ---------- Tabs ---------- */
function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  if(id==="notes") showCategories();
  if(id==="history") loadHistory();
}
show("quick");

/* ---------- QUICK NOTES ---------- */
setInterval(async()=>{
  const t = await fetch("/note").then(r=>r.text());
  if(document.activeElement!==quick && t!==lastText){
    quick.value = t;
    lastText = t;
  }
},1000);

quick.oninput=()=>{
  lastText = quick.value;
  fetch("/note",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({text:quick.value})
  });
};

function copy(){navigator.clipboard.writeText(quick.value)}
async function paste(){quick.value += await navigator.clipboard.readText()}
function clearQuick(){
  if(!quick.value.trim()) return;
  fetch("/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:quick.value})});
  quick.value=""; lastText="";
  fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:""})});
}

/* ---------- HISTORY ---------- */
async function loadHistory(){
  const h = await fetch("/history").then(r=>r.json());
  history.innerHTML = h.map(x=>"<div class='item'>"+x.text+"</div>").join("");
}

/* ---------- NOTIZEN ---------- */
async function showCategories(){
  currentCategory = null;
  const data = await fetch("/cat").then(r=>r.json());
  notesView.innerHTML = \`
    <input id="newCat" placeholder="Neue Kategorie">
    <button onclick="createCat()">Kategorie erstellen</button>
  \`;
  Object.keys(data).forEach(c=>{
    notesView.innerHTML += \`
      <div class="item">
        <button class="big" onclick="openCategory('\${c}')">\${c}</button>
      </div>
    \`;
  });
}

async function createCat(){
  const n = document.getElementById("newCat").value.trim();
  if(!n) return;
  await fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n})});
  showCategories();
}

async function openCategory(cat){
  currentCategory = cat;
  const data = await fetch("/cat").then(r=>r.json());
  const notes = data[cat] || [];

  notesView.innerHTML = \`
    <button onclick="showCategories()">⬅ Zurück</button>
    <h3>\${cat}</h3>
    <button class="big" onclick="newNote()">➕ Notiz erstellen</button>
  \`;

  notes.forEach((n,i)=>{
    notesView.innerHTML += \`
      <div class="item">
        <div>\${n.text}</div>
        <div class="small">\${new Date(n.time).toLocaleString()}</div>
        <button onclick="editNote(\${i})">✏️</button>
        <button onclick="deleteNote(\${i})">🗑</button>
      </div>
    \`;
  });
}

function newNote(){
  const t = prompt("Notiz schreiben");
  if(!t) return;
  fetch("/cat-note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:currentCategory,text:t})})
    .then(()=>openCategory(currentCategory));
}

function editNote(i){
  fetch("/cat").then(r=>r.json()).then(data=>{
    const old = data[currentCategory][i].text;
    const t = prompt("Notiz bearbeiten", old);
    if(t===null) return;
    fetch("/cat-note-edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:currentCategory,index:i,text:t})})
      .then(()=>openCategory(currentCategory));
  });
}

function deleteNote(i){
  if(!confirm("Notiz löschen?")) return;
  fetch("/cat-note-del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:currentCategory,index:i})})
    .then(()=>openCategory(currentCategory));
}
</script>

</body>
</html>`);
});

/* ---------- API ---------- */
app.get("/note",(r,s)=>s.send(fs.existsSync(NOTE_FILE)?fs.readFileSync(NOTE_FILE,"utf8"):""));
app.post("/note",(r,s)=>{fs.writeFileSync(NOTE_FILE,r.body.text||"");s.sendStatus(200)});

app.get("/history",(r,s)=>s.json(read(HISTORY_FILE,[])));
app.post("/history",(r,s)=>{
  const h=read(HISTORY_FILE,[]);
  h.unshift({text:r.body.text,time:Date.now()});
  write(HISTORY_FILE,h.slice(0,50));
  s.sendStatus(200);
});

app.get("/cat",(r,s)=>s.json(read(CATEGORY_FILE,{})));
app.post("/cat",(r,s)=>{
  const c=read(CATEGORY_FILE,{});
  if(!c[r.body.name]) c[r.body.name]=[];
  write(CATEGORY_FILE,c);
  s.sendStatus(200);
});
app.post("/cat-note",(r,s)=>{
  const c=read(CATEGORY_FILE,{});
  c[r.body.cat].unshift({text:r.body.text,time:Date.now()});
  write(CATEGORY_FILE,c);
  s.sendStatus(200);
});
app.post("/cat-note-edit",(r,s)=>{
  const c=read(CATEGORY_FILE,{});
  c[r.body.cat][r.body.index].text = r.body.text;
  write(CATEGORY_FILE,c);
  s.sendStatus(200);
});
app.post("/cat-note-del",(r,s)=>{
  const c=read(CATEGORY_FILE,{});
  c[r.body.cat].splice(r.body.index,1);
  write(CATEGORY_FILE,c);
  s.sendStatus(200);
});

app.listen(PORT,()=>console.log("Server läuft auf Port",PORT));