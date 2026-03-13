# Demo

The demo is a small console simulation that feeds frame times into the governor
and prints the resulting quality adjustments.

Run it locally:

```bash
npm run demo
```

The example uses:

- an XR-headset device profile negotiated to a 72 Hz target,
- visual ladders for render scale, shadows, and particles,
- a protected authoritative physics ladder that the governor will not reduce by
  default.
