import { Logger, ServiceUnavailableException } from "@nestjs/common";
import convert from "heic-convert";
import sharp from "sharp";

// Minimal shared Claude Messages API client (raw fetch, like scanning/). New AI
// features use this instead of copying the key/model/fetch boilerplate again.

const API_URL = "https://api.anthropic.com/v1/messages";
const logger = new Logger("AnthropicClient");

export type ClaudeBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: { type: "base64"; media_type: string; data: string };
    }
  | {
      type: "document";
      source: { type: "base64"; media_type: "application/pdf"; data: string };
    };

export function claudeEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function callClaude(opts: {
  model: string;
  maxTokens: number;
  content: ClaudeBlock[];
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) {
    throw new ServiceUnavailableException(
      "AI is not configured (missing ANTHROPIC_API_KEY)",
    );
  }
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: [{ role: "user", content: opts.content }],
    }),
  });
  if (!res.ok) {
    logger.error(`Anthropic responded ${res.status}: ${await res.text()}`);
    throw new ServiceUnavailableException("AI service failed");
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text || "")
    .join("");
}

// Pulls the first {...} object out of a model reply (tolerates code fences/prose).
export function parseJsonObject<T = Record<string, unknown>>(text: string): T {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error("No JSON object in model response");
  }
  return JSON.parse(cleaned.slice(start, end + 1)) as T;
}

function isHeic(buffer: Buffer, mimetype: string): boolean {
  if (/heic|heif/i.test(mimetype || "")) return true;
  if (buffer.length < 12 || buffer.toString("ascii", 4, 8) !== "ftyp") {
    return false;
  }
  const brand = buffer.toString("ascii", 8, 12).toLowerCase();
  return (
    brand.startsWith("hei") ||
    brand.startsWith("mif") ||
    brand.startsWith("msf") ||
    brand === "hevc"
  );
}

// Any phone photo (incl. HEIC) → JPEG with the long side capped, so it fits the
// API's image limits and isn't billed for pixels the model downsizes anyway.
export async function imageToJpeg(
  buffer: Buffer,
  mimetype: string,
  maxSide = 1568,
  quality = 80,
): Promise<Buffer> {
  let input = buffer;
  if (isHeic(buffer, mimetype)) {
    input = Buffer.from(await convert({ buffer, format: "JPEG", quality: 0.9 }));
  }
  return sharp(input)
    .rotate()
    .resize({
      width: maxSide,
      height: maxSide,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality })
    .toBuffer();
}

export function imageBlock(jpeg: Buffer): ClaudeBlock {
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/jpeg",
      data: jpeg.toString("base64"),
    },
  };
}
