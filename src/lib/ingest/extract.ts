// Text extraction for uploaded school material.
export type ExtractResult = {
  text: string;
  imageDataUrl: string | null;
  note: string | null; // human-readable extraction note
};

function cleanText(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractFromFile(
  file: File
): Promise<ExtractResult> {
  const name = file.name.toLowerCase();
  const ext = name.split(".").pop() ?? "";
  const buf = Buffer.from(await file.arrayBuffer());

  if (file.type.startsWith("image/")) {
    const dataUrl = `data:${file.type};base64,${buf.toString("base64")}`;
    return {
      text: "",
      imageDataUrl: dataUrl,
      note: "Image stored. AI vision analysis will transcribe/extract content when connected.",
    };
  }

  if (ext === "pdf" || file.type === "application/pdf") {
    try {
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      const result = await parser.getText();
      await parser.destroy();
      const text = cleanText(
        (result.pages ?? []).map((p) => p.text).join("\n\n") || result.text || ""
      );
      return {
        text,
        imageDataUrl: null,
        note: text ? null : "No selectable text found (scanned PDF?). Try uploading screenshots of the pages instead.",
      };
    } catch (e) {
      return { text: "", imageDataUrl: null, note: `PDF extraction failed: ${(e as Error).message}` };
    }
  }

  if (ext === "docx" || ext === "doc") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      return { text: cleanText(result.value), imageDataUrl: null, note: null };
    } catch (e) {
      return { text: "", imageDataUrl: null, note: `DOCX extraction failed: ${(e as Error).message}` };
    }
  }

  if (ext === "pptx" || ext === "ppt") {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buf);
      const slideFiles = Object.keys(zip.files)
        .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => {
          const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
          const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
          return na - nb;
        });
      const parts: string[] = [];
      for (const sf of slideFiles) {
        const xml = await zip.files[sf].async("string");
        const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
        if (texts.length)
          parts.push(`--- Slide ${parts.length + 1} ---\n${texts.join("\n")}`);
      }
      return { text: cleanText(parts.join("\n\n")), imageDataUrl: null, note: null };
    } catch (e) {
      return { text: "", imageDataUrl: null, note: `PPTX extraction failed: ${(e as Error).message}` };
    }
  }

  // txt / md / csv / anything text-ish
  try {
    const text = cleanText(buf.toString("utf8"));
    return { text, imageDataUrl: null, note: null };
  } catch {
    return { text: "", imageDataUrl: null, note: "Unsupported file type — no text extracted." };
  }
}

export function chunkText(text: string, size = 1100, overlap = 120): string[] {
  const clean = text.replace(/\s+\n/g, "\n").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(i + size, clean.length);
    if (end < clean.length) {
      const brk = clean.lastIndexOf("\n", end);
      const dot = clean.lastIndexOf(". ", end);
      const cut = Math.max(brk, dot);
      if (cut > i + size * 0.5) end = cut + 1;
    }
    chunks.push(clean.slice(i, end).trim());
    i = end - overlap;
    if (i < 0) i = 0;
    if (chunks.length > 400) break;
  }
  return chunks.filter(Boolean);
}
