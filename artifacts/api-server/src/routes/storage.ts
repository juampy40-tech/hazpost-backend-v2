import { Router, type IRouter, type Request, type Response } from "express";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for client-side direct upload to GCS.
 * Send JSON: { name: string, size: number, contentType: string }
 * Returns: { uploadURL: string, objectPath: string }
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  try {
    const { name, size, contentType } = req.body as { name?: string; size?: number; contentType?: string };
    if (!name || !contentType) {
      res.status(400).json({ error: "name and contentType are required" });
      return;
    }

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json({ uploadURL, objectPath });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * GET /storage/objects/<path>
 *
 * Serve a stored object by its path.
 * Uses router.use to handle arbitrary sub-paths (path-to-regexp v8 compatible).
 */
router.use("/storage/objects", async (req: Request, res: Response) => {
  try {
    const subPath = req.path.replace(/^\//, "");
    if (!subPath) {
      res.status(400).json({ error: "Object path required" });
      return;
    }
    const objectPath = `/objects/${subPath}`;
    const file = await objectStorageService.getObjectEntityFile(objectPath);
    const response = await objectStorageService.downloadObject(file);

    res.setHeader("Content-Type", response.headers.get("Content-Type") ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=86400");

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
    } else {
      res.status(500).json({ error: "Failed to retrieve object" });
    }
  }
});

export default router;
