# Bus Dismissal Board

A live board for managing school bus arrival and departure across 4 lanes at dismissal.

## Hosted (anyone, anywhere)

Live at **https://lonestar-bus-board.netlify.app**. Everyone who opens it
shares one board that stays in sync (updates appear within ~2 seconds).
The board is stored server-side by a Netlify Function using Netlify Blobs.

Deploy updates with:

```
netlify deploy --prod
```

## Run it locally

**With the shared server (Netlify Function + Blobs):**

```
npm install
netlify dev
```

then open the printed URL (http://localhost:8888). This mirrors production.

**With the standalone Node server (websocket sync on your LAN):**

```
npm start
```

and open http://localhost:3000. Other devices on the same Wi-Fi can reach
it at `http://<this-computer's-IP>:3000`.

**No server at all:** double-click `public/index.html`. The board runs
entirely in your browser and saves on that device only (header shows
"This device").

## How to use

- **Manage Roster** — add your bus numbers once; they stay saved day to day.
  "Add as Substitute" adds a bus for today only.
- As buses pull in, **drag** their block from *Not Arrived* into the lane they
  arrived in. Order within a lane is the order in line (top = front / "next").
  Drag to reorder or move between lanes any time.
- When a bus leaves, tap its **Departed ✓** button (or drag it to the
  Departed column). **↩ Undo** brings it back if tapped by mistake.
- **New Day** resets every bus to Not Arrived and removes substitutes.
  If the board is showing a previous day, a banner offers the reset on load.

## Where data lives

- Hosted / `netlify dev`: Netlify Blobs, shared by everyone.
- `npm start`: `data/state.json`, shared by devices hitting that server.
- No-server (file://): the browser's localStorage on that one device.

These backends don't share data with each other.

## How the client picks a mode

`public/js/app.js` auto-detects at load: if socket.io is present it's the
`npm start` server (websockets); else if served over http(s) it uses the
REST API at `/api/board` with polling (hosted); else (file://) it saves to
localStorage. The board logic in `public/js/state.js` is shared by the
browser, the Node server, and the Netlify Function.
