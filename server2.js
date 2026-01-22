import express from "express";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";
import crypto from "crypto";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3001;
const FILE = "./data2.json";

app.use(express.json());

/* ================= DATA ================= */
let data = { users:{}, feed:[] };
const sessions = {};

const emptyUser = ()=>({ quick:"", history:[], categories:{} });

const save=()=>{
  fs.writeFileSync(FILE,JSON.stringify(data,null,2));
  broadcast();
};
if(fs.existsSync(FILE)) data=JSON.parse(fs.readFileSync(FILE));

/* ================= WS ================= */
const broadcast=()=>{
  const msg=JSON.stringify({data});
  wss.clients.forEach(c=>c.readyState===1&&c.send(msg));
};
wss.on("connection",ws=>ws.send(JSON.stringify({data})));

/* ================= AUTH ================= */
const auth=(req,res,next)=>{
  const s=req.headers["x-session"];
  if(!s||!sessions[s]) return res.sendStatus(401);
  req.user=sessions[s];
  next();
};

app.post("/register",(r,s)=>{
  const {u,p}=r.body;
  if(!u||!p||data.users[u])return s.sendStatus(400);
  data.users[u]={pass:p,data:emptyUser()};
  save(); s.sendStatus(200);
});

app.post("/login",(r,s)=>{
  const {u,p}=r.body;
  if(!data.users[u]||data.users[u].pass!==p) return s.sendStatus(401);
  const sid=crypto.randomUUID();
  sessions[sid]=u;
  s.json({sid});
});

/* ================= NOTES (SERVER 1 LOGIK) ================= */
app.get("/data",auth,(r,s)=>s.json(data.users[r.user].data));

app.post("/quick",auth,(r,s)=>{
  data.users[r.user].data.quick=r.body.t||"";
  save(); s.sendStatus(200);
});

app.post("/clear",auth,(r,s)=>{
  const u=data.users[r.user].data;
  if(u.quick&&u.history[0]!==u.quick){
    u.history.unshift(u.quick);
    u.history=u.history.slice(0,50);
  }
  u.quick=""; save(); s.sendStatus(200);
});

app.post("/hist/del",auth,(r,s)=>{
  data.users[r.user].data.history.splice(r.body.i,1);
  save(); s.sendStatus(200);
});

app.post("/hist/edit",auth,(r,s)=>{
  const u=data.users[r.user].data;
  u.quick=u.history[r.body.i];
  save(); s.sendStatus(200);
});

/* ===== Kategorien exakt wie gefordert ===== */
app.post("/cat/add",auth,(r,s)=>{
  const u=data.users[r.user].data;
  if(!u.categories[r.body.n])
    u.categories={ [r.body.n]:[], ...u.categories };
  save(); s.sendStatus(200);
});

app.post("/cat/rename",auth,(r,s)=>{
  const u=data.users[r.user].data;
  const {o,n}=r.body;
  if(u.categories[o]&&n){
    u.categories={ [n]:u.categories[o], ...u.categories };
    delete u.categories[o];
  }
  save(); s.sendStatus(200);
});

app.post("/cat/del",auth,(r,s)=>{
  delete data.users[r.user].data.categories[r.body.n];
  save(); s.sendStatus(200);
});

app.post("/note/add",auth,(r,s)=>{
  data.users[r.user].data.categories[r.body.c]
    .unshift({t:r.body.t,time:Date.now()});
  save(); s.sendStatus(200);
});

app.post("/note/del",auth,(r,s)=>{
  data.users[r.user].data.categories[r.body.c].splice(r.body.i,1);
  save(); s.sendStatus(200);
});

/* ================= FEED ================= */
app.post("/feed/add",auth,(r,s)=>{
  data.feed.unshift({u:r.user,t:r.body.t,time:Date.now()});
  save(); s.sendStatus(200);
});

/* ================= UI ================= */
app.get("/",(_,res)=>res.send(`<!doctype html>
<html><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<style>
body{margin:0;background:#121212;color:#eee;font-family:sans-serif}
#menu{position:fixed;top:0;left:-220px;width:200px;height:100%;
background:#1e1e1e;padding:10px;transition:.3s}
#menu button{width:100%;margin:5px 0}
#top{padding:10px;background:#1e1e1e}
.tab{display:none;padding:10px;margin-top:50px}
.item{border-bottom:1px solid #333;padding:8px}
textarea,input{width:100%;background:#121212;color:#eee;border:1px solid #333;padding:8px}
</style></head>
<body>

<div id=menu>
<button onclick=show('quick')>Quick</button>
<button onclick=show('cats')>Kategorien</button>
<button onclick=show('hist')>History</button>
<button onclick=show('feed')>Feed</button>
</div>

<div id=top>
<button onclick="menu.style.left=menu.style.left==='0px'?'-220px':'0px'">☰</button>
</div>

<div id=auth class=tab>
<input id=u placeholder=User>
<input id=p type=password placeholder=Pass>
<button onclick=login()>Login</button>
<button onclick=reg()>Register</button>
</div>

<div id=quick class=tab>
<button onclick=clr()>Clear → History</button>
<textarea id=q></textarea>
</div>

<div id=cats class=tab>
<input id=newCat placeholder="Kategorie">
<button onclick=addCat()>+</button>
<div id=catList></div>
<div id=notes></div>
</div>

<div id=hist class=tab></div>

<div id=feed class=tab>
<textarea id=post></textarea>
<button onclick=postFeed()>Post</button>
<div id=feedList></div>
</div>

<script>
let sid,ws,state={},activeCat=null;

const api=(u,d)=>fetch(u,{
 method:"POST",
 headers:{"Content-Type":"application/json","x-session":sid},
 body:JSON.stringify(d||{})
});

function login(){
 fetch("/login",{method:"POST",headers:{"Content-Type":"application/json"},
 body:JSON.stringify({u:u.value,p:p.value})})
 .then(r=>r.json()).then(j=>{
  sid=j.sid; show("quick"); connect();
 });
}
function reg(){api("/register",{u:u.value,p:p.value});}

function connect(){
 ws=new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
 ws.onmessage=e=>{state=JSON.parse(e.data).data;render();}
}

function show(id){
 document.querySelectorAll(".tab").forEach(t=>t.style.display="none");
 document.getElementById(id).style.display="block";
 menu.style.left="-220px";
}

q.oninput=()=>api("/quick",{t:q.value});
const clr=()=>api("/clear");

function render(){
 const d=state.users?.[u.value]?.data;
 if(!d) return;
 q.value=d.quick||"";

 hist.innerHTML=d.history.map((h,i)=>\`
 <div class=item>\${h}
 <button onclick="api('/hist/edit',{i:\${i}})">✏️</button>
 <button onclick="if(confirm('Löschen?'))api('/hist/del',{i:\${i}})">🗑</button>
 </div>\`).join("");

 catList.innerHTML=Object.keys(d.categories).map(c=>\`
 <div class=item>
 <b onclick="openCat('\${c}')">\${c}</b>
 <button onclick="const n=prompt('Neuer Name', '\${c}');
 if(n)api('/cat/rename',{o:'\${c}',n})">✏️</button>
 <button onclick="if(confirm('Kategorie löschen?'))
 api('/cat/del',{n:'\${c}'})">🗑</button>
 </div>\`).join("");

 feedList.innerHTML=state.feed.map(f=>\`
 <div class=item><b>\${f.u}</b>: \${f.t}</div>\`).join("");
}

function addCat(){ api("/cat/add",{n:newCat.value}); newCat.value=""; }

function openCat(c){
 activeCat=c;
 const n=state.users[u.value].data.categories[c];
 notes.innerHTML=\`
 <input id=nt placeholder="Notiz">
 <button onclick="api('/note/add',{c:'\${c}',t:nt.value});nt.value=''">+</button>
 \`+n.map((x,i)=>\`
 <div class=item>\${x.t}
 <button onclick="if(confirm('Notiz löschen?'))
 api('/note/del',{c:'\${c}',i:\${i}})">🗑</button>
 </div>\`).join("");
}

function postFeed(){ api("/feed/add",{t:post.value}); post.value=""; }

show("auth");
</script>
</body></html>`));

server.listen(PORT,()=>console.log("SERVER 2 KOMPLETT FERTIG"));
