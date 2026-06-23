/**
 * vision-delegate (injection) — image understanding via a scoped vision
 * sub-agent. Primary chat model NEVER changes.
 *
 * `before_agent_start` collects images from event.images + @<image-path> +
 * pi-clipboard-<uuid>.<ext> paths, calls a vision model in a scoped complete()
 * (image(s) + focused prompt ONLY, never the session history → no overflow),
 * and injects the text description back for the primary model. No model swap.
 *
 * Uses minimax-m3:cloud (no thinking) for a fast ~3-5s call (vs qwen3.5's
 * 11-33s with thinking) to minimize the pre-agent-loop wait. A notify is
 * emitted before the call for feedback.
 *
 * `[image-N]` markers are produced for the vision sub-agent (exact positional
 * mapping). image-marker-editor renders pi-clipboard paths as `[image-N]`.
 */

import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync } from "node:fs";

const VISION_PROVIDER = "ollama";
const VISION_MODEL = "minimax-m3:cloud"; // text+image, no thinking → fast

const IMG_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};

const metaPrompt = (userText: string, n: number): string => {
  const slots = Array.from({ length: n }, (_, i) => `[image-${i + 1}] (relates to surrounding text): <description>`).join("\n");
  return (
    `The user sent a message with ${n} image(s) attached, shown above in order. ` +
    `The user's text (may contain [image-N] markers showing where each image belongs) is:\n"""\n${userText}\n"""\n\n` +
    `For each image (in order), describe it in the local context of the text around its [image-N] marker, ` +
    `and read any visible text. Return a structured per-image description:\n${slots}\n\n` +
    `Be concise but complete. If the user asked a question, answer it per image.`
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

// @<image-path> (group 1) OR pi-clipboard-<uuid>.<ext> temp path (group 2)
const PATH_RE = /(?:@(\S+\.(?:png|jpe?g|gif|webp)))|([^\s]*pi-clipboard-[a-f0-9-]+\.(?:png|jpe?g|gif|webp))/gi;

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event: any, ctx: any) => {
    const promptText: string = (event.prompt ?? "").toString();
    const existing: any[] = Array.isArray(event.images) ? event.images : [];

    const matches = [...promptText.matchAll(PATH_RE)];
    const fromPath: any[] = [];
    const replacements: { index: number; full: string; marker: string }[] = [];
    for (const m of matches) {
      const p = (m[1] || m[2]) as string;
      const img = readImageFile(p);
      if (!img) continue;
      fromPath.push(img);
      replacements.push({ index: m.index!, full: m[0] as string, marker: `[image-${existing.length + fromPath.length}]` });
    }

    const images = [...existing, ...fromPath];
    if (images.length === 0) return;

    let markerText = promptText;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      markerText = markerText.slice(0, r.index) + r.marker + markerText.slice(r.index + r.full.length);
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

    if (ctx.hasUI) ctx.ui.notify(`vision-delegate: analyzing ${images.length} image(s) with ${VISION_MODEL}…`, "info");

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

    if (ctx.hasUI) ctx.ui.notify(`vision-delegate: done — ${images.length} image(s) analyzed`, "info");
    return {
      message: {
        customType: "vision-delegate",
        content: `[Vision sub-agent analysis of the attached image(s)]\n${description}\n[End analysis — use this to answer the user's question about the image(s).]`,
        display: true,
      },
    };
  });
}