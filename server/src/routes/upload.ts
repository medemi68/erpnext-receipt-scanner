import { Router, Request, Response } from "express";
import multer from "multer";
import { config } from "../config.js";
import { processFile } from "../services/fileProcessor.js";
import { extractInvoiceData } from "../services/aiExtractor.js";
import { formatResponse } from "../services/responseFormatter.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
});

// Exact path the ERPNext module calls
router.post(
  "/api/method/doc2sys.doc2sys.doctype.doc2sys_item.doc2sys_item.upload_and_create_item",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      if (!req.file) {
        res.status(400).json({
          message: { success: false, message: "No file uploaded" },
        });
        return;
      }

      console.log(
        `Processing file: ${req.file.originalname} (${(req.file.size / 1024).toFixed(1)} KB)`
      );

      // 1. Convert file to images
      const images = await processFile(req.file.buffer, req.file.originalname);
      console.log(`Converted to ${images.length} image(s)`);

      // 2. Send to AI for extraction
      const extraction = await extractInvoiceData(images);
      console.log(
        `Extracted invoice: ${extraction.InvoiceId} from ${extraction.VendorName}`
      );

      // 3. Format into KAINOTOMO-compatible response
      const response = formatResponse(extraction);

      res.json(response);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`Upload processing error: ${message}`);
      res.status(500).json({
        message: { success: false, message: `Processing error: ${message}` },
      });
    }
  }
);

export default router;
