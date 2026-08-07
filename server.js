const http = require("http");
const path = require("path");
const express = require("express");
const { Server } = require("socket.io");
const stateLib = require("./public/js/state");
const persist = require("./lib/persist");

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.static(path.join(__dirname, "public")));

const server = http.createServer(app);
const io = new Server(server);

const state = stateLib.normalize(persist.load());

io.on("connection", (socket) => {
  socket.emit("state", state);

  for (const [event, mutate] of Object.entries(stateLib.actions)) {
    socket.on(event, (payload) => {
      let changed = false;
      try {
        changed = mutate(state, payload || {});
      } catch (err) {
        console.error(`Error handling ${event}:`, err.message);
      }
      if (changed) {
        persist.save(state);
        io.emit("state", state);
      } else {
        // Invalid action — resync just the sender so it can't drift.
        socket.emit("state", state);
      }
    });
  }
});

function shutdown() {
  persist.flush();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Bus board running at http://localhost:${PORT}`);
});
