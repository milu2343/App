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
body{margin:0;font-family:sans-serif;background:#121212;color:#eee}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
button.big{font-size:16px;padding:10px 16px}
.tab{display:none;padding:10px}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
.item{border-bottom:1px solid #333;padding:10px}
.small{font-size:12px;color:#aaa}
h3{margin-top:20px}
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
  <button onclick="copy()">Copy</button>
  <button onclick="paste()">Paste</button>
  <button onclick="clearQuick()">Clear</button>
  <textarea id="quickText"></textarea>
</div>

<!-- NOTIZEN -->
<div id="notes" class="tab">
  <div id="catView"></div>
</div>

<!-- HISTORY -->
<div id="history" class="tab"></div>

<script>
const quick = document.getElementById("quickText");
let lastText = "";
let activeCategory = null;

/* ---------- Tabs ---------- */
function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  if(id==="history") loadHistory();
  if(id==="notes") loadCategories();
}
show("quick");

/* ---------- Quick Notes ---------- */
setInterval(async()=>{
  const t = await fetch("/note").then(r=>r.text());
  if(document.activeElement!==quick && t!==lastText){
    quick.value=t; lastText=t;
  }
},1000);

quick.oninput=()=>{
  lastText=quick.value;
  fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:quick.value})});
};

function copy(){navigator.clipboard.writeText(quick.value)}
async function paste(){quick.value+=await navigator.clipboard.readText()}
function clearQuick(){
  if(!quick.value.trim()) return;
  fetch("/history",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:quick.value})});
  quick.value=""; lastText="";
  fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:""})});
}

/* ---------- History ---------- */
async function loadHistory(){
  const h = await fetch("/history").then(r=>r.json());
  history.innerHTML = h.map(x=>"<div class='item'>"+x.text+"</div>").join("");
}

/* ---------- Kategorien ---------- */
async function loadCategories(){
  activeCategory = null;
  const data = await fetch("/cat").then(r=>r.json());
  catView.innerHTML = \`
    <input id="newCat" placeholder="Neue Kategorie">
    <button onclick="createCat()">Kategorie erstellen</button>
  \`;
  Object.keys(data).forEach(c=>{
    catView.innerHTML += \`<div class="item"><button class="big" onclick="openCat('\${c}')">\${c}</button></div>\`;
  });
}

async function createCat(){
  const n = document.getElementById("newCat").value.trim();
  if(!n) return;
  await fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n})});
  loadCategories();
}

async function openCat(cat){
  activeCategory = cat;
  const data = await fetch("/cat").then(r=>r.json());
  const notes = data[cat] || [];
  catView.innerHTML = \`
    <button onclick="loadCategories()">⬅ Zurück</button>
    <h3>\${cat}</h3>
    <button class="big" onclick="newNote()">➕ Notiz erstellen</button>
  \`;
  notes.forEach((n,i)=>{
    catView.innerHTML += \`
      <div class="item">
        <div>\${n.text}</div>
        <div class="small">\${new Date(n.time).toLocaleString()}</div>
        <button onclick="editNote(\${i})">✏️</button>
        <button onclick="delNote(\${i})">🗑</button>
      </div>
    \`;
  });
}

function newNote(){
  const t = prompt("Notiz schreiben");
  if(!t) return;
  fetch("/cat-note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCategory,text:t})})
    .then(()=>openCat(activeCategory));
}

function editNote(i){
  fetch("/cat").then(r=>r.json()).then(data=>{
    const old = data[activeCategory][i].text;
    const t = prompt("Notiz bearbeiten", old);
    if(t===null) return;
    fetch("/cat-note-edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCategory,index:i,text:t})})
      .then(()=>openCat(activeCategory));
  });
}

function delNote(i){
  if(!confirm("Notiz löschen?")) return;
  fetch("/cat-note-del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCategory,index:i})})
    .then(()=>openCat(activeCategory));
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
app.post("/cat-note-del",(r,s)=>{
  const c=read(CATEGORY_FILE,{});
  c[r.body.cat].splice(r.body.index,1);
  write(CATEGORY_FILE,c);
  s.sendStatus(200);
});
app.post("/cat-note-edit",(r,s)=>{
  const c=read(CATEGORY_FILE,{});
  c[r.body.cat][r.body.index].text = r.body.text;
  write(CATEGORY_FILE,c);
  s.sendStatus(200);
});

app.listen(PORT,()=>console.log("Server läuft auf Port",PORT));