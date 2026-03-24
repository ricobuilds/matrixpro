# Matrix Pro

No-code data exploration and visualisation. Built with **Vite + React + Electron + sql.js**.

---

## Quick start

```bash
npm install
npm run dev
```

> `npm run dev` starts Vite on port 5173 and launches Electron pointing at it.  
> No native compilation required — sql.js is pure WebAssembly.

---

## Build for distribution

```bash
npm run build:mac     # → release/Matrix Pro-2.0.0.dmg  (arm64 + x64)
npm run build:win     # → release/Matrix Pro Setup 2.0.0.exe
npm run build:linux   # → release/Matrix Pro-2.0.0.AppImage
```

---

## Ollama AI Insights

Matrix Pro calls a locally-running Ollama instance to generate dataset-specific insight suggestions.

```bash
# Install Ollama
brew install ollama          # macOS
# or https://ollama.com

# Pull a model (any of these work)
ollama pull llama3.2         # recommended
ollama pull mistral
ollama pull phi3

# Ollama auto-starts on localhost:11434
```

Click **Generate** in the Graph → AI Insights section.  
The app works fully without Ollama — the panel shows a friendly retry button.

---

## Keyboard shortcuts

| Shortcut     | Action               |
|--------------|----------------------|
| ⌘O           | Open dataset         |
| ⌘1           | Table view           |
| ⌘2           | Graph view           |
| ⌘\\          | Toggle filter panel  |
| ⌘S           | Save current graph   |
| ⌘E           | Export CSV           |
| ⌘⇧E          | Export chart PNG     |
| Esc          | Close modal          |

---

## Data persistence

Datasets and saved graphs are stored in SQLite (via sql.js) at:

| Platform | Location |
|----------|----------|
| macOS    | `~/Library/Application Support/matrix-pro/matrix-pro.db` |
| Windows  | `%APPDATA%\matrix-pro\matrix-pro.db` |
| Linux    | `~/.config/matrix-pro/matrix-pro.db` |

Data is restored automatically on next launch.

---

## Supported formats

Drop files onto the window, or press **⌘O**:

- `.csv` — comma-separated
- `.tsv` — tab-separated
