const express = require('express');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const NOTE_FILE = 'note.txt';
const HISTORY_FILE = 'history.json';
const MAX_HISTORY = 50;

app.use(express.json());

// ---------------- Helpers ----------------
function readNote() {
  if (!fs.existsSync(NOTE_FILE)) return '';
  return fs.readFileSync(NOTE_FILE, 'utf8');
}

function writeNote(text) {
  fs.writeFileSync(NOTE_FILE, text || '');
}

function readHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8')); } 
  catch(e) { return []; }
}

function addHistory(text) {
  text = text.trim();
  if (!text) return;
  let h = readHistory();
  if (h.length > 0 && h[0].text === text) return;
  h.unshift({ text, time: Date.now() });
  h = h.slice(0, MAX_HISTORY);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(h));
}

function deleteHistory(index) {
  let h = readHistory();
  if (index>=0 && index<h.length) {
    h.splice(index,1);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(h));
  }
}

// ---------------- Hauptseite ----------------
app.get('/', (req,res)=>{
  res.write('<!DOCTYPE html><html lang="de"><head>');
  res.write('<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">');
  res.write('<title>Quick Notes</title>');
  res.write('<style>');
  res.write(`
    body{margin:0;font-family:sans-serif;background:#f5f5f5;}
    header{display:flex;gap:6px;align-items:center;padding:10px;background:#222;color:#fff;}
    header span{flex:1;}
    button{background:#444;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-size:14px;}
    button.danger{background:#e74c3c;}
    textarea{width:100%;height:calc(100vh - 52px);font-size:16px;padding:10px;border:none;box-sizing:border-box;}
    .tab{display:none;padding:10px;background:#fff;max-height:50vh;overflow:auto;border-top:1px solid #ccc;}
    .item{padding:8px;border-bottom:1px solid #eee;cursor:pointer;font-size:14px;display:flex;justify-content:space-between;align-items:center;}
    .item:hover{background:#f0f0f0;}
    .del{color:red;font-weight:bold;cursor:pointer;margin-left:10px;font-size:18px;}
    #backBtn{background:#888;color:white;margin-bottom:8px;}
  `);
  res.write('</style></head><body>');

  // Header
  res.write('<header><span>📝 Quick Notes</span>');
  res.write('<button id="paste">Paste</button>');
  res.write('<button id="historyBtn">History</button>');
  res.write('<button id="clear" class="danger">Clear</button>');
  res.write('</header>');

  // Tabs
  res.write('<textarea id="note" placeholder="Notizen hier..."></textarea>');
  res.write('<div id="historyTab" class="tab"><button id="backBtn">← Back to Notes</button><div id="historyList"></div></div>');

  // JS
  res.write('<script>');
  res.write(`
    const note=document.getElementById("note");
    const historyTab=document.getElementById("historyTab");
    const historyList=document.getElementById("historyList");

    async function save(){clearTimeout(window.t);window.t=setTimeout(()=>fetch("/note",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:note.value})}),300);}
    fetch("/note").then(r=>r.text()).then(t=>note.value=t);

    // Paste
    document.getElementById("paste").onclick=async()=>{
      try{note.value+=await navigator.clipboard.readText();save();}
      catch(e){alert("Clipboard blockiert");}
    };

    // Clear
    document.getElementById("clear").onclick=async()=>{
      if(!note.value)return;
      await fetch("/history-add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:note.value})});
      note.value="";
      save();
    };

    // History Tab öffnen
    document.getElementById("historyBtn").onclick=async()=>{
      historyList.innerHTML="";
      const res=await fetch("/history");
      const h=await res.json();
      h.forEach((item,index)=>{
        const div=document.createElement("div");
        div.className="item";

        // Textspan anklickbar
        const textSpan=document.createElement("span");
        textSpan.textContent=item.text;
        textSpan.style.flex="1";
        textSpan.onclick=()=>{note.value=item.text;save();historyTab.style.display="none";note.style.display="block";};
        div.appendChild(textSpan);

        // Delete Button
        const del=document.createElement("span");
        del.textContent="×";
        del.className="del";
        del.onclick=async(e)=>{e.stopPropagation();await fetch("/history-del",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({index})});div.remove();};
        div.appendChild(del);

        historyList.appendChild(div);
      });
      historyTab.style.display="block";
      note.style.display="none";
    };

    // Back to Notes
    document.getElementById("backBtn").onclick=()=>{
      historyTab.style.display="none";
      note.style.display="block";
    };
  `);
  res.write('</script></body></html>');
  res.end();
});

// ---------------- API ----------------
app.get('/note',(req,res)=>res.send(readNote()));
app.post('/note',(req,res)=>{writeNote(req.body.text);res.sendStatus(200);});
app.get('/history',(req,res)=>res.json(readHistory()));
app.post('/history-add',(req,res)=>{addHistory(req.body.text||'');res.sendStatus(200);});
app.post('/history-del',(req,res)=>{deleteHistory(req.body.index);res.sendStatus(200);});

app.listen(PORT,()=>console.log('Server läuft auf Port '+PORT));