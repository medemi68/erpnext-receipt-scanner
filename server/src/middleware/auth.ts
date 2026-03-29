import { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("token ")) {
    res.status(401).json({ message: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(6); // Remove "token " prefix
  const [key, secret] = token.split(":");

  if (!key || !secret) {
    res.status(401).json({ message: "Invalid token format" });
    return;
  }

  if (key !== config.authTokenKey || secret !== config.authTokenSecret) {
    res.status(403).json({ message: "Invalid credentials" });
    return;
  }

  next();
}
