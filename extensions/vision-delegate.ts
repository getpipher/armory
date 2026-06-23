/**
 * vision-delegate — image understanding via a scoped vision sub-agent.
 *
 * The PRIMARY chat model NEVER changes. `before_agent_start` (fires in both
 * -p and interactive) does everything:
 *   1. Collect images from event.images (populated by -p @file / clipboard
 *      Ctrl+V) AND from `@<image-path>` references parsed out of event.prompt
 *      (interactive @path, which otherwise stays literal text with no image).
 *   2. Call a vision model in a scoped complete() — image(s) + focused prompt
 *      ONLY, never the session history → no context overflow possible.
 *   3. Inject the text description back as a message the PRIMARY model reads.
 *
 * No model swap. `[image-N]` markers are produced for the vision sub-agent
 * prompt (exact positional mapping for multi-image prompts). Live inline
 * `[image-N]` rendering in the editor is a planned Phase 2 (custom editor).
 */

import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";

const VISION_PROVIDER = "ollama";
const VISION_MODEL = "qwen3.5:cloud";

const IMG_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};

const metaPrompt = (userText: string, n: number): string => {
  const slots = Array.from({ length: n }, (_, i) => `[image-${i + 1}] (relates to surrounding text): <description>`).join("\n");
  return (
    `The user sent a message with ${n} image(s) attached, shown above in order. ` +
    `The user's text (which may contain [image-N] markers showing where each image belongs) is:\n"""\n${userText}\n"""\n\n` +
    `For each image (in order), describe it in the local context of the text around its [image-N] marker, ` +
    `and read any visible text. Return a structured per-image description in this format:\n${slots}\n\n` +
    `Be concise but complete. If the user asked a question about the image(s), answer it per image.`
  );
};

function readImageFile(path: string): any | null {
  try {
    const m = path.match(/\.([a-z0-9]+)$/i);
    const ext = m ? m[1].toLowerCase() : "";
    const mimeType = IMG_MIME[ext] ?? "image/png";
    const data = Buffer.from(readFileSync(path)).toString("base64");
    return { type: "image", data, mimeType };
  } catch {
    return null;
  }
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const promptText: string = (event.prompt ?? "").toString();
    const existing: any[] = Array.isArray(event.images) ? event.images : [];

    // Collect @<image-path> references from the prompt (interactive @path).
    const atPathRe = /@(\S+\.(?:png|jpe?g|gif|webp))/gi;
    const atPathMatches = [...promptText.matchAll(atPathRe)];
    const fromPath: any[] = [];
    for (const m of atPathMatches) {
      const img = readImageFile(m[1] as string);
      if (img) fromPath.push(img);
    }

    const images = [...existing, ...fromPath];
    if (images.length === 0) return;

    // Build marker text: replace @<image-path> with [image-N] for the vision sub-agent.
    let markerText = promptText;
    for (let i = atPathMatches.length - 1; i >= 0; i--) {
      const m = atPathMatches[i];
      const num = existing.length + i + 1;
      markerText = markerText.slice(0, m.index!) + `[image-${num}]` + markerText.slice(m.index! + (m[0] as string).length);
    }

    const model = ctx.modelRegistry.find(VISION_PROVIDER, VISION_MODEL);
    if (!model) {
      if (ctx.hasUI) ctx.ui.notify(`vision-delegate: ${VISION_PROVIDER}/${VISION_MODEL} not found in models.json`, "warning");
      return;
    }
    const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
    if (!auth?.ok || !auth.apiKey) {
      if (ctx.hasUI) ctx.ui.notify(`vision-delegate: no API key for ${VISION_PROVIDER}/${VISION_MODEL}`, "warning");
      return;
    }

    const content: any[] = [
      ...images.map((img: any) => ({ type: "image", data: img.data, mimeType: img.mimeType })),
      { type: "text", text: metaPrompt(markerText, images.length) },
    ];
    const messages = [{ role: "user", content, timestamp: Date.now() }];

    let description = "";
    try {
      const res: any = await complete(
        model as any,
        { messages } as any,
        { apiKey: auth.apiKey, headers: auth.headers } as any,
      );
      description = (res?.content ?? [])
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text)
        .join("\n")
        .trim();
    } catch (e: any) {
      if (ctx.hasUI) ctx.ui.notify(`vision-delegate: vision sub-agent call failed: ${e?.message ?? e}`, "warning");
      return;
    }
    if (!description) {
      if (ctx.hasUI) ctx.ui.notify(`vision-delegate: vision sub-agent returned no description`, "warning");
      return;
    }

    if (ctx.hasUI) ctx.ui.notify(`vision-delegate: ${images.length} image(s) analyzed by ${VISION_MODEL} sub-agent`, "info");
    return {
      message: {
        customType: "vision-delegate",
        content: `[Vision sub-agent analysis of the attached image(s)]\n${description}\n[End analysis — use this to answer the user's question about the image(s).]`,
        display: true,
      },
    };
  });
}