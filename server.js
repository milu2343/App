const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const FILE = path.join(__dirname, "data.json");

app.use(express.json());

let data = {
  quick: "",
  history: [],
  categories: {}
};

// ---------- Speicher ----------
function load() {
  if (fs.existsSync(FILE)) {
    data = JSON.parse(fs.readFileSync(FILE, "utf8"));
  }
}
function save() {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

load();

// ---------- API ----------
app.get("/data", (_, res) => res.json(data));

app.post("/quick", (req, res) => {
  if (data.quick) data.history.unshift(data.quick);
  data.history = data.history.slice(0, 50);
  data.quick = req.body.text || "";
  save();
  res.sendStatus(200);
});

app.post("/cat", (req, res) => {
  const name = req.body.name;
  if (!name) return res.sendStatus(400);
  if (!data.categories[name]) data.categories[name] = [];
  save();
  res.sendStatus(200);
});

app.post("/note", (req, res) => {
  const { cat, text } = req.body;
  data.categories[cat].unshift(text);
  save();
  res.sendStatus(200);
});

app.post("/edit", (req, res) => {
  const { cat, i, text } = req.body;
  data.categories[cat][i] = text;
  save();
  res.sendStatus(200);
});

app.post("/del", (req, res) => {
  const { cat, i } = req.body;
  data.categories[cat].splice(i, 1);
  save();
  res.sendStatus(200);
});

// ---------- UI ----------
app.get("/", (_, res) => {
res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notes</title>
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px}
textarea.full{height:100%}
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
<textarea id="q" class="full" placeholder="Quick Notes..."></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<script>
let data={}, active=null;
const q=document.getElementById("q");
const view=document.getElementById("view");

async function load(){
  data=await fetch("/data").then(r=>r.json());
  render();
}
q.oninput=()=>fetch("/quick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:q.value})});

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}

function render(){
  if(document.getElementById("quick").style.display==="block") q.value=data.quick||"";
  if(document.getElementById("history").style.display==="block")
    history.innerHTML=(data.history||[]).map(x=>"<div class=item>"+x+"</div>").join("");
  if(document.getElementById("notes").style.display==="block")
    active?open(active):cats();
}

function cats(){
  active=null;
  view.innerHTML='<input id=c placeholder="Neue Kategorie"><button onclick=addCat()>+</button>';
  Object.keys(data.categories).reverse().forEach(c=>{
    view.innerHTML+=\`<div class=item><button onclick="open('\${c}')">\${c}</button></div>\`;
  });
}

function addCat(){
  const c=document.getElementById("c").value.trim();
  if(!c)return;
  fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:c})}).then(load);
}

function open(c){
  active=c;
  view.innerHTML='<button onclick=cats()>⬅</button><h3>'+c+'</h3><textarea id=n placeholder="Neue Notiz"></textarea><button onclick=addNote()>Speichern</button>';
  data.categories[c].forEach((n,i)=>{
    view.innerHTML+=\`<div class=item><textarea oninput="edit(\${i},this.value)">\${n}</textarea><button onclick="del(\${i})">🗑</button></div>\`;
  });
}

function addNote(){
  const t=document.getElementById("n").value.trim();
  if(!t)return;
  fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:active,text:t})}).then(load);
}
function edit(i,t){fetch("/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:active,i,text:t})})}
function del(i){fetch("/del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:active,i})}).then(load)}

show("quick"); load();
</script>
</body>
</html>`);
});

app.listen(PORT,()=>console.log("Server läuft sauber 👍"));