# Bus Dismissal Board

A live board for managing school bus arrival and departure across 4 lanes at dismissal.

## Run it

```
npm install
npm start
```

Then open http://localhost:3000.

Every device that opens the page sees the same board and updates live —
open it in two windows side by side to see the sync. Other devices on the
same Wi-Fi can reach it at `http://<this-computer's-IP>:3000` (allow Node
through the Windows firewall when prompted).

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

Board state is saved to `data/state.json` automatically and survives
restarting the server.
