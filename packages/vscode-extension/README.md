# Routogram for VS Code / Cursor

- Activity Bar mini-canvas embedded from the local Routogram canvas (`:6060`).
- Active editor sync sends the file to the daemon (`:4040`), focusing matching nodes.
- CodeLens above components: `[Routogram: N Child Components | M Consumed Tokens | D Dead CSS]`.
- `Routogram: Show Component Blast Radius`.
- `Routogram: Open Full Canvas in Browser`.

Start the daemon first:

```bash
routogram
```

Then open the Routogram Activity Bar view. Both daemon and canvas URLs are configurable.
