import { Router, Request, Response } from "express";
import type { CreditsResponse } from "../types/index.js";

const router = Router();

// Stub endpoint - returns unlimited credits since this is self-hosted
router.post(
  "/api/method/doc2sys.doc2sys.doctype.doc2sys_user_settings.doc2sys_user_settings.get_user_credits",
  (_req: Request, res: Response): void => {
    const response: CreditsResponse = {
      message: {
        success: true,
        credits: 999999,
      },
    };
    res.json(response);
  }
);

export default router;
