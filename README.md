# Bus Dismissal Board

A live board for managing school bus arrival and departure across 4 lanes at dismissal.

## Run it

**Easiest — no server:** double-click `public/index.html`. The board runs
entirely in your browser and saves automatically on this device
(the header shows "This device").

**Multi-device live sync:** run

```
npm install
npm start
```

and open http://localhost:3000. Every device that opens the page sees the
same board and updates live — open it in two windows side by side to see
the sync. Other devices on the same Wi-Fi can reach it at
`http://<this-computer's-IP>:3000` (allow Node through the Windows
firewall when prompted). The header shows "Live" in this mode.

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

- No-server mode: saved in the browser's localStorage on that device.
- Server mode: saved to `data/state.json` and shared by all devices.

The two modes don't share data with each other.
