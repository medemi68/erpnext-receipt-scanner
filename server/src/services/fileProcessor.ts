import { fromPath } from "pdf2pic";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import os from "os";

export interface ProcessedImage {
  base64: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
const PDF_EXTENSIONS = new Set([".pdf"]);

const MAX_DIMENSION = 1568; // fits well within API limits
const JPEG_QUALITY = 80;

function getMediaType(
  ext: string
): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

/**
 * Resize and compress an image buffer to JPEG, keeping it under API payload limits.
 */
async function compressImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

export async function processFile(
  fileBuffer: Buffer,
  originalName: string
): Promise<ProcessedImage[]> {
  const ext = path.extname(originalName).toLowerCase();

  if (PDF_EXTENSIONS.has(ext)) {
    return processPdf(fileBuffer);
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    return processImage(fileBuffer);
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

async function processImage(buffer: Buffer): Promise<ProcessedImage[]> {
  const compressed = await compressImage(buffer);
  console.log(
    `Image: ${(buffer.length / 1024).toFixed(0)} KB -> ${(compressed.length / 1024).toFixed(0)} KB JPEG`
  );
  return [{ base64: compressed.toString("base64"), mediaType: "image/jpeg" }];
}

async function processPdf(buffer: Buffer): Promise<ProcessedImage[]> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `invoice-${Date.now()}.pdf`);

  try {
    fs.writeFileSync(tmpFile, buffer);

    const converter = fromPath(tmpFile, {
      density: 200,
      saveFilename: "page",
      savePath: tmpDir,
      format: "png",
      width: 2048,
      height: 2048,
      preserveAspectRatio: true,
    });

    const results = await converter.bulk(-1, { responseType: "base64" });

    const images: ProcessedImage[] = [];
    for (const result of results) {
      if (result.base64) {
        // Re-compress the rendered PNG to JPEG
        const pngBuffer = Buffer.from(result.base64, "base64");
        const compressed = await compressImage(pngBuffer);
        console.log(
          `PDF page: ${(pngBuffer.length / 1024).toFixed(0)} KB PNG -> ${(compressed.length / 1024).toFixed(0)} KB JPEG`
        );
        images.push({
          base64: compressed.toString("base64"),
          mediaType: "image/jpeg",
        });
      }
    }

    if (images.length === 0) {
      throw new Error("Failed to convert PDF to images");
    }

    return images;
  } finally {
    if (fs.existsSync(tmpFile)) {
      fs.unlinkSync(tmpFile);
    }
  }
}
