const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, "data.json");

app.use(express.json());

/* ---------- DATA ---------- */
let data = {
  quick: "",
  history: [],
  categories: {}
};

if (fs.existsSync(DATA_FILE)) {
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    console.log("data.json beschädigt, starte neu");
  }
}

function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ---------- API ---------- */
app.get("/data", (req, res) => {
  res.json(data);
});

app.post("/quick", (req, res) => {
  data.quick = req.body.text || "";
  save();
  res.sendStatus(200);
});

app.post("/clear", (req, res) => {
  const t = data.quick.trim();
  if (t && !data.history.includes(t)) {
    data.history.unshift(t);
  }
  data.quick = "";
  save();
  res.sendStatus(200);
});

app.post("/history/edit", (req, res) => {
  data.quick = data.history[req.body.i] || "";
  save();
  res.sendStatus(200);
});

app.post("/history/delete", (req, res) => {
  data.history.splice(req.body.i, 1);
  save();
  res.sendStatus(200);
});

app.post("/cat", (req, res) => {
  const c = req.body.name;
  if (!data.categories[c]) data.categories[c] = [];
  save();
  res.sendStatus(200);
});

app.post("/note/add", (req, res) => {
  data.categories[req.body.cat].unshift({
    text: "",
    time: new Date().toLocaleString()
  });
  save();
  res.sendStatus(200);
});

app.post("/note/edit", (req, res) => {
  data.categories[req.body.cat][req.body.i].text = req.body.text;
  save();
  res.sendStatus(200);
});

app.post("/note/delete", (req, res) => {
  data.categories[req.body.cat].splice(req.body.i, 1);
  save();
  res.sendStatus(200);
});

/* ---------- BACKUP ---------- */
app.get("/backup", (req, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=notes-backup.json");
  res.json(data);
});

/* ---------- UI ---------- */
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notes</title>
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif;height:100vh}
header{display:flex;gap:8px;padding:10px;background:#1e1e1e;flex-wrap:wrap}
button{background:#2c2c2c;color:#fff;border:none;padding:10px 14px;border-radius:8px;font-size:15px;cursor:pointer}
.tab{display:none;padding:10px;height:calc(100vh - 60px);overflow:auto}
.tab.active{display:block}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;border-radius:8px;padding:10px;font-size:16px}
textarea.big{height:calc(100vh - 140px)}
.item{border-bottom:1px solid #333;padding:10px 0}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
small{color:#aaa}
</style>
</head>

<body>
<header>
<button onclick="show('quick')">Quick</button>
<button onclick="show('cats')">Notizen</button>
<button onclick="show('history')">History</button>
<button onclick="window.location='/backup'">Backup ⬇</button>
</header>

<div id="quick" class="tab active">
<div class="row">
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<button onclick="clearQuick()">Clear</button>
</div>
<textarea id="q" class="big"></textarea>
</div>

<div id="cats" class="tab">
<div class="row">
<input id="newCat" placeholder="Neue Kategorie">
<button onclick="addCat()">+</button>
</div>
<div id="catList"></div>
</div>

<div id="notes" class="tab">
<button onclick="show('cats')">⬅</button>
<button onclick="addNote()">Notiz +</button>
<h3 id="catTitle"></h3>
<div id="noteList"></div>
</div>

<div id="history" class="tab"></div>

<script>
let data={}, activeCat=null;
const q=document.getElementById("q");

async function load(){
  data = await fetch("/data").then(r=>r.json());
  q.value=data.quick||"";
  render();
}
load();

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  render();
}

q.oninput=()=>fetch("/quick",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:q.value})});

function clearQuick(){
  fetch("/clear",{method:"POST"}).then(load);
}

function copy(){navigator.clipboard.writeText(q.value)}
async function paste(){q.value+=await navigator.clipboard.readText()}

function render(){
  if(cats.classList.contains("active")){
    catList.innerHTML="";
    Object.keys(data.categories||{}).forEach(c=>{
      catList.innerHTML+=\`<div class="item"><button onclick="openCat('\${c}')">\${c}</button></div>\`;
    });
  }

  if(history.classList.contains("active")){
    history.innerHTML="";
    data.history.forEach((t,i)=>{
      history.innerHTML+=\`<div class="item">\${t}<br>
      <button onclick="editHist(\${i})">✏️</button>
      <button onclick="delHist(\${i})">🗑</button></div>\`;
    });
  }

  if(notes.classList.contains("active")){
    noteList.innerHTML="";
    data.categories[activeCat].forEach((n,i)=>{
      noteList.innerHTML+=\`<div class="item">
      <small>\${n.time}</small>
      <textarea oninput="editNote(\${i},this.value)">\${n.text}</textarea>
      <button onclick="delNote(\${i})">🗑</button>
      </div>\`;
    });
  }
}

function addCat(){
  const v=newCat.value.trim();
  if(!v) return;
  fetch("/cat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name:v})}).then(load);
}

function openCat(c){
  activeCat=c;
  catTitle.innerText=c;
  show("notes");
}

function addNote(){
  fetch("/note/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat})}).then(load);
}

function editNote(i,t){
  fetch("/note/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i,text:t})});
}

function delNote(i){
  fetch("/note/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({cat:activeCat,i})}).then(load);
}

function editHist(i){
  fetch("/history/edit",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({i})}).then(()=>show("quick"));
}

function delHist(i){
  fetch("/history/delete",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({i})}).then(load);
}
</script>
</body>
</html>`);
});

/* ---------- START ---------- */
app.listen(PORT, () => console.log("Server läuft auf Port", PORT));