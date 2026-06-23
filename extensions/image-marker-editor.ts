/**
 * image-marker-editor — live inline `[image-N]` tokens when pasting images.
 *
 * Wraps the default editor (extends CustomEditor so ALL app keybindings still
 * work: escape, ctrl+d, model switching, text editing, etc.). On Ctrl+V
 * (app.clipboard.pasteImage):
 *   1. `super.handleInput(data)` runs the app's default handler — it reads the
 *      clipboard and attaches the image to the message (event.images). We do
 *      NOT override onPasteImage, so attachment still works.
 *   2. Then we insert a `[image-N]` marker at the cursor via insertTextAtCursor.
 *
 * So pasted images show inline as labeled `[image-N]` tokens (accent-colored),
 * and the marker number is derived from existing markers in the text (so it
 * stays correct across multi-paste and editor resets). The number matches the
 * order the app attaches images → vision-delegate maps `[image-N]` → Nth image.
 *
 * No readClipboardImage deep import (the app reads the clipboard). No breaking
 * the app's image attachment (super handles it). This is Phase 2 of the
 * vision-delegation design.
 */

import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

class ImageMarkerEditor extends CustomEditor {
  private kb: any;
  private themeCapture: any;

  constructor(tui: any, theme: any, keybindings: any, options?: any) {
    super(tui, theme, keybindings, options);
    this.kb = keybindings;
    this.themeCapture = theme;
  }

  handleInput(data: string): void {
    // Detect the paste-image key the same way CustomEditor does internally.
    if (this.kb?.matches?.(data, "app.clipboard.pasteImage")) {
      super.handleInput(data); // app reads clipboard + attaches image (onPasteImage)
      // Derive the next marker number from existing [image-N] tokens in the text
      // (self-correcting across editor resets / multi-paste).
      const existing = (this.getText().match(/\[image-\d+\]/g) || []).length;
      this.insertTextAtCursor?.(`[image-${existing + 1}]`);
      this.tui?.requestRender?.();
      return;
    }
    super.handleInput(data);
  }

  render(width: number): string[] {
    const lines = super.render(width);
    const fg = this.themeCapture?.fg;
    if (!fg) return lines;
    return lines.map((line) => line.replace(/\[image-\d+\]/g, (m) => fg("accent", m)));
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", (_event: any, ctx: any) => {
    if (!ctx.hasUI) return; // editor only exists in TUI/RPC, not print mode
    // Replace the default editor with our marker-aware one. Extends CustomEditor
    // so all app keybindings + wiring (onPasteImage, actionHandlers) still apply.
    ctx.ui.setEditorComponent((tui: any, theme: any, kb: any) => new ImageMarkerEditor(tui, theme, kb));
  });
}