/**
 * vision-delegate (tool-based) — image understanding via a scoped vision
 * sub-agent, with proper UI feedback (no perceived hang).
 *
 * Primary chat model NEVER changes. Design:
 *   - `before_agent_start`: collect images from event.images + @<image-path>
 *     + pi-clipboard-<uuid> paths, STASH them, and inject a system-prompt nudge
 *     telling the primary model to call the `describe_image` tool. This is fast
 *     (no blocking call) so there's no hang.
 *   - `describe_image` tool: the primary model calls it (pi shows a tool-
 *     execution indicator while it runs — visible feedback, no hang). The tool
 *     calls a vision model in a scoped complete() (image(s) + focused prompt
 *     ONLY, never the session history → no overflow) and returns the text
 *     description as the tool result. The primary model uses it to answer.
 *
 * `[image-N]` markers are produced for the vision sub-agent (exact positional
 * mapping). image-marker-editor renders pi-clipboard paths as `[image-N]` in
 * the editor.
 */

import { complete } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFileSync } from "node:fs";

const VISION_PROVIDER = "ollama";
const VISION_MODEL = "qwen3.5:cloud";

const IMG_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};

// Per-turn stash: images collected in before_agent_start, consumed by the tool.
let turnImages: any[] = [];
let turnMarkerText = "";

const metaPrompt = (userText: string, n: number, question?: string): string => {
  const slots = Array.from({ length: n }, (_, i) => `[image-${i + 1}] (relates to surrounding text): <description>`).join("\n");
  const focus = question ? `\nThe user's question/focus: "${question}"\n` : "\n";
  return (
    `The user sent a message with ${n} image(s) attached, shown above in order. ` +
    `The user's text (may contain [image-N] markers showing where each image belongs) is:\n"""\n${userText}\n"""\n${focus}` +
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
  pi.on("before_agent_start", async (event: any, _ctx: any) => {
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
    turnImages = images;
    if (images.length === 0) { turnMarkerText = ""; return; }

    let markerText = promptText;
    for (let i = replacements.length - 1; i >= 0; i--) {
      const r = replacements[i];
      markerText = markerText.slice(0, r.index) + r.marker + markerText.slice(r.index + r.full.length);
    }
    turnMarkerText = markerText;

    // Nudge the primary model to call describe_image (no blocking call here → no hang).
    const nudge =
      `\n\n[vision-delegate] ${images.length} image(s) are attached to this turn ` +
      `(shown inline as [image-N] markers or as file paths in the user's text). ` +
      `You cannot see images directly. Call the \`describe_image\` tool NOW, passing the ` +
      `user's question as \`question\`, to get a description from a vision sub-agent — ` +
      `then answer the user using that description.`;
    return { systemPrompt: (event.systemPrompt ?? "") + nudge };
  });

  pi.registerTool({
    name: "describe_image",
    label: "Describe image",
    description:
      "Get a description of the image(s) attached to the current turn by delegating to a vision sub-agent. " +
      "Call this FIRST (before answering) whenever the user asks about an attached image/screenshot and you " +
      "can't see it directly. Pass the user's question as `question`.",
    parameters: Type.Object({
      question: Type.Optional(Type.String({ description: "The user's question about the image, or a focus for the description" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx: any) {
      const images = turnImages;
      const markerText = turnMarkerText;
      turnImages = [];
      turnMarkerText = "";
      if (!images || images.length === 0) {
        return { content: [{ type: "text", text: "No image attached to this turn." }], details: {} };
      }

      const model = ctx?.modelRegistry?.find?.(VISION_PROVIDER, VISION_MODEL);
      if (!model) {
        return { content: [{ type: "text", text: `vision-delegate: ${VISION_PROVIDER}/${VISION_MODEL} not found in models.json` }], details: {} };
      }
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
      if (!auth?.ok || !auth.apiKey) {
        return { content: [{ type: "text", text: `vision-delegate: no API key for ${VISION_PROVIDER}/${VISION_MODEL}` }], details: {} };
      }

      const question = (params as any)?.question;
      const content: any[] = [
        ...images.map((img: any) => ({ type: "image", data: img.data, mimeType: img.mimeType })),
        { type: "text", text: metaPrompt(markerText, images.length, question) },
      ];
      const messages = [{ role: "user", content, timestamp: Date.now() }];

      try {
        const res: any = await complete(
          model as any,
          { messages } as any,
          { apiKey: auth.apiKey, headers: auth.headers, reasoningEffort: "off" } as any,
        );
        const desc = (res?.content ?? [])
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n")
          .trim();
        return { content: [{ type: "text", text: desc || "No description returned." }], details: {} };
      } catch (e: any) {
        return { content: [{ type: "text", text: `vision-delegate: vision sub-agent call failed: ${e?.message ?? e}` }], details: {} };
      }
    },
  });
}