import express from "express";
import http from "http";
import WebSocket from "ws";
import fs from "fs";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3001;

// JSON-Datei für persistente Speicherung
const DATA_FILE = "./users.json";

// ---------------- Daten laden / speichern ----------------
let users = {};
if (fs.existsSync(DATA_FILE)) {
  users = JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveUsers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

// ---------------- Middleware ----------------
app.use(express.json());
app.use(express.static("public"));

// ---------------- WebSocket ----------------
const wsClients = new Map(); // ws → userId

wss.on("connection", (ws) => {
  let userId = null;

  ws.on("message", async (msg) => {
    try {
      const m = JSON.parse(msg);

      // Login / Benutzer identifizieren
      if (m.type === "login") {
        userId = m.userId || `guest_${Math.random().toString(36).slice(2)}`;
        if (!users[userId]) {
          users[userId] = { quickNote: "", history: [], categories: {} };
          saveUsers();
        }
        wsClients.set(ws, userId);
        ws.send(JSON.stringify({ type: "sync", data: users[userId] }));
      }

      if (!userId) return;

      const data = users[userId];

      // Quick Notes
      if (m.type === "quick") {
        if (data.quickNote !== m.text) data.quickNote = m.text;
        broadcastUser(userId, { type: "sync", data });
        saveUsers();
      }

      // Clear → in History
      if (m.type === "clear") {
        if (data.quickNote) {
          if (data.history[0] !== data.quickNote) data.history.unshift(data.quickNote);
          data.history = data.history.slice(0, 50);
          data.quickNote = "";
          broadcastUser(userId, { type: "sync", data });
          saveUsers();
        }
      }

      // Kategorien
      if (m.type === "addCat" && !data.categories[m.name]) {
        data.categories[m.name] = [];
        broadcastUser(userId, { type: "sync", data });
        saveUsers();
      }
      if (m.type === "delCat") {
        delete data.categories[m.cat];
        broadcastUser(userId, { type: "sync", data });
        saveUsers();
      }
      if (m.type === "renameCat" && data.categories[m.old]) {
        data.categories[m.new] = data.categories[m.old];
        delete data.categories[m.old];
        broadcastUser(userId, { type: "sync", data });
        saveUsers();
      }

      // Notizen
      if (m.type === "addNote") {
        data.categories[m.cat].unshift({ text: m.text, created: new Date().toISOString() });
        broadcastUser(userId, { type: "sync", data });
        saveUsers();
      }
      if (m.type === "editNote") {
        data.categories[m.cat][m.i].text = m.text;
        broadcastUser(userId, { type: "sync", data });
        saveUsers();
      }
      if (m.type === "delNote") {
        data.categories[m.cat].splice(m.i, 1);
        broadcastUser(userId, { type: "sync", data });
        saveUsers();
      }
    } catch (e) {
      console.error("WS message error:", e);
    }
  });

  ws.on("close", () => {
    wsClients.delete(ws);
  });
});

function broadcastUser(userId, msg) {
  const message = JSON.stringify(msg);
  for (const [client, uid] of wsClients.entries()) {
    if (uid === userId && client.readyState === WebSocket.OPEN) client.send(message);
  }
}

// ---------------- Backup ----------------
app.get("/backup/:userId", (req, res) => {
  const user = users[req.params.userId];
  if (!user) return res.status(404).send("User not found");
  res.setHeader("Content-Disposition", `attachment; filename=${req.params.userId}_notes.json`);
  res.json(user);
});

// ---------------- Server starten ----------------
server.listen(PORT, () => console.log(`Server2 läuft auf Port ${PORT}`));