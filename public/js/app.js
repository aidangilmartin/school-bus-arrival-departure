/* global io, Sortable, BusState */
(function () {
  "use strict";

  // Three modes, auto-detected:
  //  - "socket": served by the local Node server (socket.io present) → live
  //     websocket sync. Used by `npm start`.
  //  - "remote": served over http(s) without socket.io (e.g. hosted on
  //     Netlify) → shared state via a REST function, polled for live updates.
  //  - "local": opened straight from index.html (file://) → state saved in
  //     this browser's localStorage only.
  const API = "/api/board";
  const LOCAL_KEY = "busBoardState";
  const isHttp = location.protocol === "http:" || location.protocol === "https:";
  const mode = typeof io !== "undefined" ? "socket" : isHttp ? "remote" : "local";
  const socket = mode === "socket" ? io() : null;

  let state = null;
  let lastVersion = -1;

  // Roles. Only the hosted "remote" mode gates management behind Google login;
  // the local Node server and file:// modes are trusted, so they're owner/admin.
  // admin = can manage the board; owner = can also manage the whitelist.
  let isAdmin = mode !== "remote";
  let isOwner = mode !== "remote";
  let idToken = null; // Google ID token for authenticated requests

  function send(event, payload) {
    if (mode === "socket") {
      socket.emit(event, payload);
    } else if (mode === "remote") {
      if (!isAdmin) return; // students can't mutate (server also enforces)
      remoteSend(event, payload);
    } else {
      // Local: apply the mutation in-browser and persist to localStorage.
      const mutate = BusState.actions[event];
      if (mutate && mutate(state, payload || {})) {
        try {
          localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
        } catch (err) {
          console.error("Failed to save board:", err);
        }
        render();
      }
    }
  }

  // ---------- Remote (REST) mode helpers ----------

  function setConnected(ok) {
    $("conn").classList.toggle("connected", ok);
    $("conn-label").textContent = ok ? "Live" : "Reconnecting…";
    $("disconnected-overlay").classList.toggle("hidden", ok);
  }

  async function remoteGet() {
    try {
      const res = await fetch(API, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      applyState(await res.json());
      setConnected(true);
    } catch (err) {
      setConnected(false);
    }
  }

  async function remoteSend(event, payload) {
    try {
      const headers = { "content-type": "application/json" };
      if (idToken) headers.authorization = "Bearer " + idToken;
      const res = await fetch(API, {
        method: "POST",
        headers,
        body: JSON.stringify({ event, payload }),
      });
      if (res.status === 403) {
        // Token expired or no longer whitelisted → drop back to student view.
        handleAuthLost();
        remoteGet();
        return;
      }
      if (!res.ok) throw new Error("HTTP " + res.status);
      applyState(await res.json());
      setConnected(true);
    } catch (err) {
      setConnected(false);
    }
  }

  // Mid-drag guard: re-rendering while a drag is in progress would destroy
  // the dragged element, so broadcasts arriving mid-drag are buffered.
  let dragging = false;
  let pendingState = null;
  let staleDismissed = false;

  const $ = (id) => document.getElementById(id);
  const lists = {
    pool: $("pool"),
    lanes: [$("lane-0"), $("lane-1"), $("lane-2"), $("lane-3")],
    departed: $("departed"),
  };

  function todayStr() {
    const d = new Date();
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  // ---------- Rendering ----------

  function busById(id) {
    return state.roster.find((b) => b.id === id);
  }

  function makeBlock(bus, zone, position) {
    const el = document.createElement("div");
    el.className = "bus";
    el.dataset.id = bus.id;
    if (zone === "lane") el.classList.add("in-lane");
    if (zone === "departed") el.classList.add("is-departed");

    const row = document.createElement("div");
    row.className = "bus-row";

    const num = document.createElement("div");
    num.className = "bus-number";
    num.textContent = bus.number;
    row.appendChild(num);

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.alignItems = "center";
    right.style.gap = "6px";
    if (bus.isSubstitute) {
      const badge = document.createElement("span");
      badge.className = "sub-badge";
      badge.textContent = "SUB";
      right.appendChild(badge);
    }
    if (zone === "lane") {
      const pos = document.createElement("span");
      pos.className = "pos-badge";
      pos.textContent = position === 0 ? "next ▸" : "#" + (position + 1);
      right.appendChild(pos);
    }
    row.appendChild(right);
    el.appendChild(row);

    // Management buttons only for admins; students get a read-only board.
    if (isAdmin && zone === "lane") {
      const btn = document.createElement("button");
      btn.className = "bus-action depart";
      btn.textContent = "Departed ✓";
      btn.addEventListener("click", () => send("bus:depart", { busId: bus.id }));
      el.appendChild(btn);
    } else if (isAdmin && zone === "departed") {
      const btn = document.createElement("button");
      btn.className = "bus-action undo";
      btn.textContent = "↩ Undo";
      btn.addEventListener("click", () => send("bus:undepart", { busId: bus.id }));
      el.appendChild(btn);
    }
    return el;
  }

  function fillList(container, ids, zone) {
    container.textContent = "";
    ids.forEach((id, i) => {
      const bus = busById(id);
      if (bus) container.appendChild(makeBlock(bus, zone, i));
    });
  }

  function render() {
    if (!state) return;

    const placed = new Set([...state.lanes.flat(), ...state.departed]);
    const poolBuses = state.roster.filter((b) => !placed.has(b.id));

    fillList(lists.pool, poolBuses.map((b) => b.id), "pool");
    state.lanes.forEach((lane, i) => fillList(lists.lanes[i], lane, "lane"));
    fillList(lists.departed, state.departed, "departed");

    $("count-pool").textContent = poolBuses.length || "";
    state.lanes.forEach((lane, i) => {
      $("count-lane-" + i).textContent = lane.length || "";
    });
    $("count-departed").textContent = state.departed.length || "";

    $("board-date").textContent = new Date(state.date + "T12:00:00").toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    renderRosterList();

    const stale = state.date !== todayStr();
    $("stale-banner").classList.toggle("hidden", !stale || staleDismissed);
  }

  function applyState(s) {
    if (s.version <= lastVersion) return;
    lastVersion = s.version;
    state = s;
    if (dragging) {
      pendingState = s;
    } else {
      render();
    }
  }

  // ---------- Init per mode ----------

  if (mode === "socket") {
    socket.on("state", applyState);
    socket.on("connect", () => {
      $("conn").classList.add("connected");
      $("conn-label").textContent = "Live";
      $("disconnected-overlay").classList.add("hidden");
    });
    socket.on("disconnect", () => {
      $("conn").classList.remove("connected");
      $("conn-label").textContent = "Disconnected";
      $("disconnected-overlay").classList.remove("hidden");
    });
  } else if (mode === "remote") {
    // Fetch shared state now, then poll for other devices' changes.
    // Auth setup (initGoogleAuth/applyRole) runs after Sortable is created.
    remoteGet();
    setInterval(remoteGet, 2000);
    $("auth-area").classList.remove("hidden");
  } else {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(LOCAL_KEY));
    } catch {
      saved = null;
    }
    state = BusState.normalize(saved);
    lastVersion = state.version;
    $("conn").classList.add("connected");
    $("conn-label").textContent = "This device";
    render();
  }

  // ---------- Drag and drop ----------

  function applyLocalMove(busId, to) {
    if (!state) return;
    for (const lane of state.lanes) {
      const i = lane.indexOf(busId);
      if (i !== -1) lane.splice(i, 1);
    }
    const di = state.departed.indexOf(busId);
    if (di !== -1) state.departed.splice(di, 1);
    if (to.type === "lane") {
      const arr = state.lanes[to.lane];
      arr.splice(Math.min(to.index, arr.length), 0, busId);
    } else if (to.type === "departed") {
      state.departed.splice(Math.min(to.index, state.departed.length), 0, busId);
    }
  }

  function zoneTarget(container, index) {
    const zone = container.dataset.zone;
    if (zone === "lane") return { type: "lane", lane: Number(container.dataset.lane), index };
    if (zone === "departed") return { type: "departed", index };
    return { type: "unassigned" };
  }

  const allContainers = [lists.pool, ...lists.lanes, lists.departed];
  const sortables = allContainers.map((container) =>
    new Sortable(container, {
      group: "buses",
      animation: 150,
      disabled: !isAdmin,       // students can't drag
      forceFallback: true,      // same drag behavior for mouse and touch
      fallbackTolerance: 4,
      delay: 120,               // long-press-ish start so taps/scrolls don't drag
      delayOnTouchOnly: true,
      touchStartThreshold: 4,
      filter: ".bus-action",    // buttons tap, not drag
      preventOnFilter: false,
      onStart: () => {
        dragging = true;
      },
      onEnd: (evt) => {
        dragging = false;
        const busId = evt.item.dataset.id;
        const to = zoneTarget(evt.to, evt.newIndex);
        send("bus:move", { busId, to });
        // Apply the move optimistically so the board doesn't snap back while
        // waiting for the server broadcast (which remains authoritative).
        applyLocalMove(busId, to);
        pendingState = null;
        render();
      },
    }),
  );

  // ---------- Roles / Google auth (remote mode) ----------

  // Reflect the current role in the UI: show/hide admin controls, toggle drag,
  // swap the sign-in button for the account chip, and re-render the board so
  // per-bus action buttons appear or disappear.
  function applyRole() {
    document.querySelectorAll(".admin-only").forEach((el) => {
      el.classList.toggle("hidden", !isAdmin);
    });
    document.querySelectorAll(".owner-only").forEach((el) => {
      el.classList.toggle("hidden", !isOwner);
    });
    sortables.forEach((s) => s.option("disabled", !isAdmin));
    if (state) render();
  }

  function showAccount(user) {
    $("google-signin").classList.add("hidden");
    const info = $("account-info");
    info.classList.remove("hidden");
    $("account-name").textContent = user.name || user.email;
    if (user.picture) $("account-pic").src = user.picture;
    else $("account-pic").classList.add("hidden");
    $("btn-signout").classList.remove("hidden");
  }

  function showSignIn() {
    $("google-signin").classList.remove("hidden");
    $("account-info").classList.add("hidden");
    $("btn-signout").classList.add("hidden");
  }

  function handleAuthLost() {
    idToken = null;
    isAdmin = false;
    isOwner = false;
    showSignIn();
    applyRole();
  }

  async function onGoogleCredential(response) {
    idToken = response.credential;
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { authorization: "Bearer " + idToken },
      });
      const data = await res.json();
      if (data.signedIn) {
        showAccount(data);
        isAdmin = !!data.isAdmin;
        isOwner = !!data.isOwner;
      } else {
        handleAuthLost();
        return;
      }
    } catch {
      handleAuthLost();
      return;
    }
    applyRole();
  }

  function initGoogleAuth() {
    const clientId = (window.APP_CONFIG || {}).googleClientId;
    if (!clientId) return; // sign-in not configured → student view only
    // GIS loads async; wait for it, then render the button.
    let tries = 0;
    const timer = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        clearInterval(timer);
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: onGoogleCredential,
          auto_select: false,
        });
        window.google.accounts.id.renderButton($("google-signin"), {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "signin_with",
        });
      } else if (++tries > 40) {
        clearInterval(timer); // ~8s; give up quietly, stay on student view
      }
    }, 200);
  }

  function signOut() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      window.google.accounts.id.disableAutoSelect();
    }
    handleAuthLost();
  }
  $("btn-signout").addEventListener("click", signOut);

  // Now that Sortable and the role helpers exist, kick off auth (remote mode).
  if (mode === "remote") {
    initGoogleAuth();
    applyRole();
  }

  // ---------- Roster modal ----------

  function renderRosterList() {
    const ul = $("roster-list");
    ul.textContent = "";
    state.roster.forEach((bus) => {
      const li = document.createElement("li");

      const num = document.createElement("span");
      num.className = "r-number";
      num.textContent = bus.number;
      li.appendChild(num);

      if (bus.isSubstitute) {
        const badge = document.createElement("span");
        badge.className = "sub-badge";
        badge.textContent = "SUB";
        li.appendChild(badge);
      }

      const edit = document.createElement("button");
      edit.className = "btn btn-small btn-ghost";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        const number = prompt("Bus number:", bus.number);
        if (number === null) return;
        send("roster:update", { id: bus.id, number });
      });
      li.appendChild(edit);

      const del = document.createElement("button");
      del.className = "btn btn-small btn-danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        if (confirm(`Remove bus ${bus.number} from the roster?`)) {
          send("roster:remove", { id: bus.id });
        }
      });
      li.appendChild(del);

      ul.appendChild(li);
    });
  }

  function addBus(isSubstitute) {
    const number = $("add-number").value.trim();
    if (!number) return;

    const warning = $("roster-warning");
    const dup = state.roster.find((b) => b.number.toLowerCase() === number.toLowerCase());
    if (dup) {
      warning.textContent = `Heads up: bus "${dup.number}" is already on the roster. Added anyway.`;
      warning.classList.remove("hidden");
    } else {
      warning.classList.add("hidden");
    }

    send("roster:add", { number, isSubstitute });
    $("add-number").value = "";
    $("add-number").focus();
  }

  $("roster-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    addBus(false);
  });
  $("btn-add-sub").addEventListener("click", () => addBus(true));

  $("btn-roster").addEventListener("click", () => {
    $("roster-warning").classList.add("hidden");
    $("roster-modal").classList.remove("hidden");
  });
  $("btn-roster-close").addEventListener("click", () => $("roster-modal").classList.add("hidden"));
  $("roster-modal").addEventListener("click", (e) => {
    if (e.target === $("roster-modal")) $("roster-modal").classList.add("hidden");
  });

  // ---------- New day ----------

  function resetDay() {
    if (confirm("Start a new day? All buses return to Not Arrived and substitutes are removed.")) {
      send("day:reset", {});
      staleDismissed = false;
    }
  }
  $("btn-newday").addEventListener("click", resetDay);
  $("btn-stale-reset").addEventListener("click", resetDay);
  $("btn-stale-dismiss").addEventListener("click", () => {
    staleDismissed = true;
    $("stale-banner").classList.add("hidden");
  });

  // ---------- Manage Access modal (admin whitelist) ----------

  async function adminsApi(method, body) {
    const headers = {};
    if (idToken) headers.authorization = "Bearer " + idToken;
    if (body) headers["content-type"] = "application/json";
    const res = await fetch("/api/admins", {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 403) {
      handleAuthLost();
      throw new Error("not authorized");
    }
    return res.json();
  }

  function renderAccessList(data) {
    const ul = $("access-list");
    ul.textContent = "";
    const rows = [
      ...data.bootstrap.map((email) => ({ email, locked: true })),
      ...data.admins.map((email) => ({ email, locked: false })),
    ];
    rows.forEach(({ email, locked }) => {
      const li = document.createElement("li");
      const span = document.createElement("span");
      span.className = "r-number";
      span.style.fontSize = "1rem";
      span.textContent = email;
      li.appendChild(span);

      if (locked) {
        const badge = document.createElement("span");
        badge.className = "sub-badge";
        badge.textContent = "OWNER";
        li.appendChild(badge);
      } else {
        const del = document.createElement("button");
        del.className = "btn btn-small btn-danger";
        del.textContent = "Remove";
        del.addEventListener("click", async () => {
          if (!confirm(`Remove ${email} from admins?`)) return;
          try {
            renderAccessList(await adminsApi("POST", { action: "remove", email }));
          } catch {}
        });
        li.appendChild(del);
      }
      ul.appendChild(li);
    });
  }

  async function openAccessModal() {
    $("access-warning").classList.add("hidden");
    $("access-modal").classList.remove("hidden");
    try {
      renderAccessList(await adminsApi("GET"));
    } catch {}
  }

  $("btn-access").addEventListener("click", openAccessModal);
  $("btn-access-close").addEventListener("click", () => $("access-modal").classList.add("hidden"));
  $("access-modal").addEventListener("click", (e) => {
    if (e.target === $("access-modal")) $("access-modal").classList.add("hidden");
  });
  $("access-add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = $("access-email").value.trim().toLowerCase();
    if (!email) return;
    const warning = $("access-warning");
    try {
      const data = await adminsApi("POST", { action: "add", email });
      if (data.error) {
        warning.textContent = data.error;
        warning.classList.remove("hidden");
        return;
      }
      warning.classList.add("hidden");
      $("access-email").value = "";
      renderAccessList(data);
    } catch {}
  });
})();
