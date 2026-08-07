const LANE_COUNT = 4;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function defaultState() {
  return {
    version: 0,
    date: todayStr(),
    roster: [],
    lanes: Array.from({ length: LANE_COUNT }, () => []),
    departed: [],
  };
}

function newId() {
  return "b_" + Math.random().toString(36).slice(2, 10);
}

function findBus(state, id) {
  return state.roster.find((b) => b.id === id);
}

// Remove a bus id from every lane and the departed list, so it can be
// re-inserted in exactly one place. Keeps the "one place per bus" invariant.
function removeEverywhere(state, id) {
  for (const lane of state.lanes) {
    const i = lane.indexOf(id);
    if (i !== -1) lane.splice(i, 1);
  }
  const i = state.departed.indexOf(id);
  if (i !== -1) state.departed.splice(i, 1);
}

// Each mutator returns true if the state changed (caller bumps nothing itself;
// version is incremented here on success).
function bump(state) {
  state.version++;
  return true;
}

function moveBus(state, { busId, to }) {
  if (!findBus(state, busId) || !to || typeof to !== "object") return false;
  if (to.type === "lane") {
    const lane = Number(to.lane);
    if (!Number.isInteger(lane) || lane < 0 || lane >= LANE_COUNT) return false;
    removeEverywhere(state, busId);
    const arr = state.lanes[lane];
    let index = Number.isInteger(to.index) ? to.index : arr.length;
    index = Math.max(0, Math.min(index, arr.length));
    arr.splice(index, 0, busId);
    return bump(state);
  }
  if (to.type === "departed") {
    removeEverywhere(state, busId);
    let index = Number.isInteger(to.index) ? to.index : state.departed.length;
    index = Math.max(0, Math.min(index, state.departed.length));
    state.departed.splice(index, 0, busId);
    return bump(state);
  }
  if (to.type === "unassigned") {
    removeEverywhere(state, busId);
    return bump(state);
  }
  return false;
}

function departBus(state, { busId }) {
  if (!findBus(state, busId)) return false;
  removeEverywhere(state, busId);
  state.departed.push(busId);
  return bump(state);
}

function undepartBus(state, { busId }) {
  if (!findBus(state, busId)) return false;
  removeEverywhere(state, busId);
  return bump(state);
}

function rosterAdd(state, { number, isSubstitute }) {
  number = String(number || "").trim();
  if (!number) return false;
  state.roster.push({
    id: newId(),
    number,
    isSubstitute: !!isSubstitute,
  });
  return bump(state);
}

function rosterUpdate(state, { id, number }) {
  const bus = findBus(state, id);
  if (!bus) return false;
  number = String(number || "").trim();
  if (!number) return false;
  bus.number = number;
  return bump(state);
}

function rosterRemove(state, { id }) {
  const i = state.roster.findIndex((b) => b.id === id);
  if (i === -1) return false;
  state.roster.splice(i, 1);
  removeEverywhere(state, id);
  return bump(state);
}

function dayReset(state) {
  state.lanes = Array.from({ length: LANE_COUNT }, () => []);
  state.departed = [];
  state.roster = state.roster.filter((b) => !b.isSubstitute);
  state.date = todayStr();
  return bump(state);
}

// Repair a state object loaded from disk so a hand-edited or corrupt file
// can't crash the server.
function normalize(raw) {
  const state = defaultState();
  if (!raw || typeof raw !== "object") return state;
  if (Number.isInteger(raw.version)) state.version = raw.version;
  if (typeof raw.date === "string") state.date = raw.date;
  if (Array.isArray(raw.roster)) {
    state.roster = raw.roster
      .filter((b) => b && typeof b === "object" && b.id && b.number)
      .map((b) => ({
        id: String(b.id),
        number: String(b.number),
        isSubstitute: !!b.isSubstitute,
      }));
  }
  const ids = new Set(state.roster.map((b) => b.id));
  const seen = new Set();
  const cleanList = (list) =>
    (Array.isArray(list) ? list : [])
      .map(String)
      .filter((id) => ids.has(id) && !seen.has(id) && (seen.add(id) || true));
  if (Array.isArray(raw.lanes)) {
    for (let i = 0; i < LANE_COUNT; i++) state.lanes[i] = cleanList(raw.lanes[i]);
  }
  state.departed = cleanList(raw.departed);
  return state;
}

const BusState = {
  LANE_COUNT,
  todayStr,
  defaultState,
  normalize,
  actions: {
    "bus:move": moveBus,
    "bus:depart": departBus,
    "bus:undepart": undepartBus,
    "roster:add": rosterAdd,
    "roster:update": rosterUpdate,
    "roster:remove": rosterRemove,
    "day:reset": dayReset,
  },
};

// Shared between the Node server (require) and the browser (script tag).
if (typeof module !== "undefined" && module.exports) {
  module.exports = BusState;
} else {
  window.BusState = BusState;
}
