const express = require("express");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

const NOTE_FILE = "note.txt";
const HISTORY_FILE = "history.json";
const CATEGORY_FILE = "categories.json";

/* ---------- Helpers ---------- */
const read = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : d;
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d));

/* ---------- ROUTES ---------- */
app.get("/", (_, res) => {
res.send(`<!DOCTYPE html><html lang="de"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notes</title>
<style>
body{margin:0;font-family:sans-serif;background:#121212;color:#eee}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:6px 10px;border-radius:6px}
.tab{display:none;padding:10px}
textarea{width:100%;min-height:100px;background:#121212;color:#eee;border:1px solid #333;padding:10px}
.item{border-bottom:1px solid #333;padding:10px}
.small{font-size:12px;color:#aaa}
</style>
</head><body>

<header>
<button onclick="show('quick')">Quick Notes</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
</header>

<!-- QUICK NOTES -->
<div id="quick" class="tab">
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<textarea id="quickText"></textarea>
</div>

<!-- NOTIZEN -->
<div id="notes" class="tab">
<input id="catName" placeholder="Kategorie Name">
<button onclick="createCat()">Kategorie erstellen</button>
<div id="cats"></div>
</div>

<!-- HISTORY -->
<div id="history" class="tab"></div>

<script>
const quick = document.getElementById("quickText");
let last = "";

/* ---------- Tabs ---------- */
function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  if(id==="history") loadHistory();
  if(id==="notes") loadCats();
}
show("quick");

/* ---------- Quick Notes ---------- */
setInterval(async()=>{
  const t = await fetch("/note").then(r=>r.text());
  if(document.activeElement!==quick && t!==last){
    quick.value=t; last=t;
  }
},1500);

quick.oninput=()=>{
  last=quick.value;
  fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:quick.value})});
};

function copy(){navigator.clipboard.writeText(quick.value)}
async function paste(){quick.value+=await navigator.clipboard.readText()}

/* ---------- History ---------- */
async function loadHistory(){
  const h = await fetch("/history").then(r=>r.json());
  history.innerHTML = h.map(x=>"<div class='item'>"+x.text+"</div>").join("");
}

/* ---------- Kategorien ---------- */
async function createCat(){
  const n = catName.value.trim();
  if(!n) return;
  await fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:n})});
  catName.value="";
  loadCats();
}

async function loadCats(){
  const c = await fetch("/cat").then(r=>r.json());
  cats.innerHTML="";
  Object.keys(c).forEach(k=>{
    const d=document.createElement("div");
    d.innerHTML="<h3>"+k+"</h3><button onclick=\\"newNote('"+k+"')\\">➕ Notiz</button>";
    c[k].forEach(n=>{
      d.innerHTML+= "<div class='item'><div>"+n.text+"</div><div class='small'>"+new Date(n.time).toLocaleString()+"</div></div>";
    });
    cats.appendChild(d);
  });
}

function newNote(cat){
  const t = prompt("Notiz schreiben");
  if(!t) return;
  fetch("/cat-note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat,text:t})}).then(loadCats);
}
</script>
</body></html>`);
});

/* ---------- API ---------- */
app.get("/note",(r,s)=>s.send(fs.existsSync(NOTE_FILE)?fs.readFileSync(NOTE_FILE,"utf8"):""));
app.post("/note",(r,s)=>{fs.writeFileSync(NOTE_FILE,r.body.text||"");s.sendStatus(200)});

app.get("/history",(r,s)=>s.json(read(HISTORY_FILE,[])));
app.post("/history",(r,s)=>{const h=read(HISTORY_FILE,[]);h.unshift({text:r.body.text,time:Date.now()});write(HISTORY_FILE,h.slice(0,50));s.sendStatus(200)});

app.get("/cat",(r,s)=>s.json(read(CATEGORY_FILE,{})));
app.post("/cat",(r,s)=>{const c=read(CATEGORY_FILE,{});c[r.body.name]=[];write(CATEGORY_FILE,c);s.sendStatus(200)});
app.post("/cat-note",(r,s)=>{const c=read(CATEGORY_FILE,{});c[r.body.cat].unshift({text:r.body.text,time:Date.now()});write(CATEGORY_FILE,c);s.sendStatus(200)});

app.listen(PORT,()=>console.log("Server läuft auf "+PORT));