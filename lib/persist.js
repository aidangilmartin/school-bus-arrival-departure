const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "state.json");
const TMP = FILE + ".tmp";

const DEBOUNCE_MS = 500;
let timer = null;
let pending = null;

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeNow(state) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TMP, JSON.stringify(state, null, 2));
  fs.renameSync(TMP, FILE);
}

function save(state) {
  pending = state;
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const s = pending;
    pending = null;
    try {
      writeNow(s);
    } catch (err) {
      console.error("Failed to save state:", err.message);
    }
  }, DEBOUNCE_MS);
}

function flush() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (pending) {
    try {
      writeNow(pending);
    } catch (err) {
      console.error("Failed to flush state:", err.message);
    }
    pending = null;
  }
}

module.exports = { load, save, flush };
