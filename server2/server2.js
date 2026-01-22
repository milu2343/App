import express from "express";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/* ---------- FILES ---------- */
const USERS_FILE = "./data/users.json";
const FEED_FILE = "./data/feed.json";

/* ---------- HELPERS ---------- */
function read(file, fallback) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  broadcast();
}

/* ---------- DATA ---------- */
let users = read(USERS_FILE, {});
let feed = read(FEED_FILE, { posts: [] });

/* ---------- LIVE SYNC ---------- */
function broadcast() {
  const msg = JSON.stringify({ users, feed });
  wss.clients.forEach(c => c.readyState === 1 && c.send(msg));
}

wss.on("connection", ws => {
  ws.send(JSON.stringify({ users, feed }));
});

/* ---------- AUTH ---------- */
app.post("/api/register", (req, res) => {
  const { user, pass } = req.body;
  if (!user || !pass) return res.sendStatus(400);
  if (users[user]) return res.sendStatus(409);

  users[user] = {
    pass,
    quick: "",
    history: [],
    categories: {}
  };
  write(USERS_FILE, users);
  res.sendStatus(200);
});

app.post("/api/login", (req, res) => {
  const { user, pass } = req.body;
  if (!users[user] || users[user].pass !== pass) return res.sendStatus(401);
  res.json({ ok: true });
});

/* ---------- NOTES ---------- */
app.get("/api/data/:user", (req, res) => {
  const u = users[req.params.user];
  if (!u) return res.sendStatus(404);
  res.json(u);
});

app.post("/api/quick", (req, res) => {
  const { user, text } = req.body;
  users[user].quick = text;
  write(USERS_FILE, users);
  res.sendStatus(200);
});

app.post("/api/clear", (req, res) => {
  const u = users[req.body.user];
  if (u.quick && u.history[0] !== u.quick) {
    u.history.unshift(u.quick);
    u.history = u.history.slice(0, 50);
  }
  u.quick = "";
  write(USERS_FILE, users);
  res.sendStatus(200);
});

/* ---------- CATEGORIES ---------- */
app.post("/api/cat/add", (req, res) => {
  const { user, name } = req.body;
  if (!users[user].categories[name]) {
    users[user].categories = { [name]: [], ...users[user].categories };
    write(USERS_FILE, users);
  }
  res.sendStatus(200);
});

app.post("/api/cat/delete", (req, res) => {
  const { user, name } = req.body;
  delete users[user].categories[name];
  write(USERS_FILE, users);
  res.sendStatus(200);
});

app.post("/api/cat/rename", (req, res) => {
  const { user, oldName, newName } = req.body;
  users[user].categories[newName] = users[user].categories[oldName];
  delete users[user].categories[oldName];
  write(USERS_FILE, users);
  res.sendStatus(200);
});

/* ---------- NOTES ---------- */
app.post("/api/note/add", (req, res) => {
  const { user, cat, text } = req.body;
  users[user].categories[cat].unshift({ text, time: Date.now() });
  write(USERS_FILE, users);
  res.sendStatus(200);
});

app.post("/api/note/delete", (req, res) => {
  const { user, cat, i } = req.body;
  users[user].categories[cat].splice(i, 1);
  write(USERS_FILE, users);
  res.sendStatus(200);
});

/* ---------- FEED ---------- */
app.post("/api/feed/post", (req, res) => {
  feed.posts.unshift({
    id: Date.now(),
    user: req.body.user,
    text: req.body.text,
    time: Date.now(),
    comments: []
  });
  write(FEED_FILE, feed);
  res.sendStatus(200);
});

/* ---------- START ---------- */
server.listen(PORT, () => console.log("Server2 läuft stabil"));
