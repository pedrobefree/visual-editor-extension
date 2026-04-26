# Chrome Web Store — Listing

## Name
Visual Edit

## Short Description (132 chars)
Edit text and Tailwind classes visually in your browser. Changes save directly to your source code.

## Detailed Description
Visual Edit lets you click any element on your local app and edit it visually — no more hunting through code files to change a button color or a heading font size.

**Built for developers and students using AI-generated code (Lovable, Bolt.new, v0, etc.)**

### How it works
1. Run `npx @visual-edit/bridge` in your project root
2. Enable the extension on your localhost tab
3. Hover to highlight elements, click to open the style panel, double-click to edit text inline

### Features
- ✏ Inline text editing — double-click any text element to edit it. Press Enter to save.
- 🎨 Tailwind class panel — visual controls for typography, spacing, colors, border, and layout
- ⚡ Live preview — see changes before saving
- ↩ Undo — revert the last applied change
- 🔌 Bridge indicator — know at a glance if the local bridge is connected

### Requirements
- Your project must run on localhost
- Install the bridge: `npm install @visual-edit/bridge` or `npx @visual-edit/bridge`
- Add the Vite or Babel plugin to inject element IDs (one-time setup via `npx @visual-edit/setup init`)

### Privacy
Visual Edit communicates exclusively with `localhost:5179`. No data is ever sent to external servers.

## Category
Developer Tools

## Language
English / Português

## Screenshots needed (1280x800 or 640x400)
1. Extension popup showing bridge connected
2. Hover overlay highlighting a button
3. Style panel open with color swatches
4. Text being edited inline
5. Before/after code change in VS Code

## Permissions justification
- `storage` — remember enabled/disabled state across tabs
- `activeTab` — inject content script only on the active tab
- `scripting` — programmatically enable/disable visual editing
- `http://localhost/*` and `http://127.0.0.1/*` — communicate with the local bridge server
