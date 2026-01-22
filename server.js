const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

app.use(express.json({ limit: "5mb" }));

let data = {
  quickNote: "",
  history: [],
  categories: {}
};

/* ---------- LIVE SYNC ---------- */
function broadcast() {
  const msg = JSON.stringify({ type: "sync", data });
  wss.clients.forEach(c => {
    if (c.readyState === 1) c.send(msg);
  });
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ type: "sync", data }));

  ws.on("message", msg => {
    const m = JSON.parse(msg);

    if (m.type === "quick") data.quickNote = m.text;

    if (m.type === "clear") {
      const t = data.quickNote.trim();
      if (t && data.history[0] !== t) {
        data.history.unshift(t);
        data.history = data.history.slice(0, 50);
      }
      data.quickNote = "";
    }

    if (m.type === "addCat" && !data.categories[m.name])
      data.categories[m.name] = [];

    if (m.type === "delCat")
      delete data.categories[m.name];

    if (m.type === "renameCat") {
      data.categories[m.newName] = data.categories[m.oldName];
      delete data.categories[m.oldName];
    }

    if (m.type === "addNote")
      data.categories[m.cat].unshift({ text: "", time: Date.now() });

    if (m.type === "editNote")
      data.categories[m.cat][m.i].text = m.text;

    if (m.type === "delNote")
      data.categories[m.cat].splice(m.i, 1);

    if (m.type === "useHistory")
      data.quickNote = data.history[m.i];

    if (m.type === "delHistory")
      data.history.splice(m.i, 1);

    broadcast();
  });
});

/* ---------- BACKUP ---------- */
app.get("/backup", (_, res) => {
  res.setHeader("Content-Disposition", "attachment; filename=notes-backup.json");
  res.json(data);
});

app.post("/restore", (req, res) => {
  if (!req.body || !req.body.categories) return res.sendStatus(400);
  data = req.body;
  broadcast();
  res.sendStatus(200);
});

/* ---------- UI ---------- */
app.get("/", (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Notes</title>
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif;height:100vh}
header{display:flex;gap:6px;padding:10px;background:#1e1e1e;flex-wrap:wrap}
button{background:#2c2c2c;color:#fff;border:none;padding:8px 12px;border-radius:6px}
.tab{display:none;height:calc(100vh - 60px);padding:10px;overflow:auto}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:10px;border-radius:6px;font-size:16px}
textarea.full{height:100%}
.item{border-bottom:1px solid #333;padding:10px;margin-bottom:5px}
.small{color:#aaa;font-size:12px}
</style>
</head>
<body>

<header>
<button onclick="show('quick')">Quick</button>
<button onclick="show('notes')">Notizen</button>
<button onclick="show('history')">History</button>
<button onclick="download()">Backup ⬇</button>
<button onclick="upload()">Restore ⬆</button>
</header>

<div id="quick" class="tab">
<button onclick="copy()">Copy</button>
<button onclick="paste()">Paste</button>
<button onclick="clearQuick()">Clear</button>
<textarea id="q" class="full"></textarea>
</div>

<div id="notes" class="tab"><div id="view"></div></div>
<div id="history" class="tab"></div>

<input type="file" id="file" style="display:none">

<script>
let ws, activeCat=null;
const q=document.getElementById("q");
const view=document.getElementById("view");
const file=document.getElementById("file");

function connect(){
  ws=new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage=e=>{
    const m=JSON.parse(e.data);
    if(m.type==="sync"){window.data=m.data;render();}
  };
}
connect();

function send(o){ws.send(JSON.stringify(o));}

function show(id){
  document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
  document.getElementById(id).style.display="block";
  render();
}
show("quick");

function render(){
  if(!window.data) return;

  if(quick.style.display==="block") q.value=window.data.quickNote||"";

  if(history.style.display==="block"){
    history.innerHTML="";
    window.data.history.forEach((h,i)=>{
      history.innerHTML+=\`
        <div class="item">\${h}
          <button onclick="send({type:'useHistory',i:\${i}})">✏</button>
          <button onclick="send({type:'delHistory',i:\${i}})">🗑</button>
        </div>\`;
    });
  }

  if(notes.style.display==="block"){
    if(!activeCat){
      view.innerHTML='<input id="nc" placeholder="Neue Kategorie"><button onclick="addCat()">+</button>';
      Object.keys(window.data.categories).forEach(c=>{
        view.innerHTML+=\`
          <div class="item">
            <button onclick="openCat('\${c}')">\${c}</button>
            <button onclick="renameCat('\${c}')">✏</button>
            <button onclick="send({type:'delCat',name:'\${c}'})">🗑</button>
          </div>\`;
      });
    } else openCat(activeCat);
  }
}

q.oninput=()=>send({type:"quick",text:q.value});
function clearQuick(){send({type:"clear"});q.value="";}
function copy(){navigator.clipboard.writeText(q.value)}
async function paste(){q.value+=await navigator.clipboard.readText();send({type:"quick",text:q.value})}

function addCat(){
  const v=document.getElementById("nc").value.trim();
  if(v) send({type:"addCat",name:v});
}
function renameCat(c){
  const n=prompt("Neuer Name",c);
  if(n) send({type:"renameCat",oldName:c,newName:n});
}

function openCat(c){
  activeCat=c;
  view.innerHTML=\`<button onclick="activeCat=null;render()">⬅</button><h3>\${c}</h3><button onclick="send({type:'addNote',cat:'\${c}'})">➕</button>\`;
  window.data.categories[c].forEach((n,i)=>{
    view.innerHTML+=\`
      <div class="item">
        <textarea oninput="send({type:'editNote',cat:'\${c}',i:\${i},text:this.value})">\${n.text}</textarea>
        <div class="small">\${new Date(n.time).toLocaleString()}</div>
        <button onclick="send({type:'delNote',cat:'\${c}',i:\${i}})">🗑</button>
      </div>\`;
  });
}

/* BACKUP UI */
function download(){ location.href="/backup"; }

function upload(){
  file.click();
}

file.onchange=()=>{
  const r=new FileReader();
  r.onload=()=>{
    fetch("/restore",{method:"POST",headers:{"Content-Type":"application/json"},body:r.result});
  };
  r.readAsText(file.files[0]);
};
</script>
</body>
</html>`);
});

server.listen(PORT,()=>console.log("Server läuft"));