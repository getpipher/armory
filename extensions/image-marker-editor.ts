/**
 * image-marker-editor — render pasted-image temp paths as inline `[image-N]`.
 *
 * pi's clipboard paste (`handleClipboardImagePaste`) saves the image to a
 * temp file `pi-clipboard-<uuid>.<ext>` and inserts that PATH as text in the
 * editor (it does not attach the image immediately — the path is the link).
 * That raw path is ugly to look at. This editor renders any `pi-clipboard-*`
 * path as a colored `[image-N]` token (visual only — the underlying text keeps
 * the path so it still functions as the image link on submit). `vision-delegate`
 * reads the `pi-clipboard-*` path from the prompt and delegates.
 *
 * Extends CustomEditor so all app keybindings/wiring stay intact. Only overrides
 * `render` (no handleInput changes → paste behavior unchanged).
 */

import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

const CLIP_PATH = /[^\s]*pi-clipboard-[a-f0-9-]+\.(?:png|jpe?g|gif|webp)/gi;

class ImageMarkerEditor extends CustomEditor {
  private themeCapture: any;

  constructor(tui: any, theme: any, keybindings: any, options?: any) {
    super(tui, theme, keybindings, options);
    this.themeCapture = theme;
  }

  render(width: number): string[] {
    const fg = this.themeCapture?.fg;
    let n = 0;
    const repl = (_m: string): string => {
      n++;
      const marker = `[image-${n}]`;
      return fg ? fg("accent", marker) : marker;
    };
    // Number per-render by occurrence order (stable across frames — positional).
    return super.render(width).map((line) => line.replace(CLIP_PATH, repl));
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event: any, ctx: any) => {
    if (!ctx.hasUI) return; // editor only in TUI/RPC
    ctx.ui.setEditorComponent((tui: any, theme: any, kb: any) => new ImageMarkerEditor(tui, theme, kb));
  });
}