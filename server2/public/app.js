let user = null;
let ws, state = {};

function connect(){
  ws = new WebSocket((location.protocol==="https:"?"wss":"ws")+"://"+location.host);
  ws.onmessage = e => {
    state = JSON.parse(e.data);
    render();
  };
}

function login(){
  user = userInput.value;
  fetch("/api/login",{method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({user,pass:pass.value})})
  .then(r=>r.ok && start());
}

function register(){
  fetch("/api/register",{method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({user:userInput.value,pass:pass.value})});
}

function start(){
  document.getElementById("login").hidden=true;
  document.getElementById("app").hidden=false;
  connect();
}

function render(){
  if(!state.users || !state.users[user]) return;
  quick.value = state.users[user].quick;
}

quick.oninput = () =>
  fetch("/api/quick",{method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({user,text:quick.value})});

function clearQuick(){
  fetch("/api/clear",{method:"POST",headers:{'Content-Type':'application/json'},body:JSON.stringify({user})});
}
