import { Router, Request, Response } from "express";

const router = Router();

router.get("/health", (_req: Request, res: Response): void => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

export default router;
