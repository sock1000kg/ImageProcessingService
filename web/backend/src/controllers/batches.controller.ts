/**
 * HTTP request controllers for batch lifecycle management and file intake.
 */
import { NextFunction, Request, Response } from "express";
import path from "node:path";
import archiver, { Archiver } from "archiver";
import {
  addBatchFile,
  createDraftBatch,
  deleteBatchById,
  getBatchById,
  getBatchReportById,
  listBatches,
  renameBatch,
  rerunBatch,
  startBatch,
} from "../services/batch.service";
import { notFound, unauthorized } from "../errors";
import { listBatchesQuerySchema, patchBatchBodySchema, validateIdParam } from "../dto";
import { createBatchDownloadToken, verifyBatchDownloadToken } from "../auth";
import { RESULTS_BUCKET, storage } from "../storage";
import { getBatch, getBatchOwnedByUser, getJobsByBatchId } from "../repositories/job.repository";
import { JobStatus } from "../generated/prisma/client";

export async function listBatchesHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const query = listBatchesQuerySchema.parse(request.query);
    const userId = request.authUser!.id;
    const result = await listBatches(userId, query);
    response.json(result);
  } catch (error) {
    next(error);
  }
}

export async function createBatchHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const filesMap = request.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const files = filesMap?.files ?? [];
    const whitelist = filesMap?.whitelist ?? [];
    const filesPresent = files.length > 0 || request.body?.files !== undefined;

    const batch = await createDraftBatch({
      whitelist,
      rawConfig: request.body.config,
      filesPresent,
      name: request.body.name,
      userId: request.authUser?.id,
    });

    response.status(201).json({ batch });
  } catch (error) {
    next(error);
  }
}

export async function addBatchFileHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const job = await addBatchFile(id, request.file, request.authUser?.id);
    response.status(201).json({ job });
  } catch (error) {
    next(error);
  }
}

export async function startBatchHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const batch = await startBatch(id, request.authUser?.id);
    response.status(202).json({ batch });
  } catch (error) {
    next(error);
  }
}

/**
 * Re-runs an existing batch with new redaction settings and optional whitelist faces.
 *
 * Why server-side duplication: Enables batch reprocessing without client re-uploading large image
 * sets, preserving contract §5 namespaces and ensuring new batches operate independently.
 */
export async function rerunBatchHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const filesMap = request.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const whitelist = filesMap?.whitelist ?? [];

    const result = await rerunBatch(id, {
      whitelist,
      rawConfig: request.body.config,
      name: request.body.name,
      userId: request.authUser!.id,
    });

    response.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getBatchHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const batch = await getBatchById(id, request.authUser?.id);
    if (!batch) {
      throw notFound("Batch not found");
    }
    response.json({ batch });
  } catch (error) {
    next(error);
  }
}

export async function updateBatchHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const body = patchBatchBodySchema.parse(request.body);
    const batch = await renameBatch(id, body.name, request.authUser?.id);
    response.status(200).json({ batch });
  } catch (error) {
    next(error);
  }
}

export async function getBatchReportHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const report = await getBatchReportById(id, request.authUser?.id);
    if (!report) {
      throw notFound("Batch not found");
    }
    response.json({ report });
  } catch (error) {
    next(error);
  }
}

export async function deleteBatchHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const deleted = await deleteBatchById(id, request.authUser?.id);
    if (!deleted) {
      throw notFound("Batch not found");
    }
    response.status(204).end();
  } catch (error) {
    next(error);
  }
}

/**
 * Generates an RFC 5987 compliant Content-Disposition attachment header with an ASCII fallback
 * and UTF-8 encoded filename*.
 */
export function buildZipContentDisposition(batchName: string): string {
  const raw = (batchName || "").trim();
  const base =
    raw
      .replace(/[/\\?%*:|"<>]/g, "")
      .replace(/[\x00-\x1f\x7f-\x9f]/g, "")
      .replace(/\.\.+/g, "")
      .trim() || "batch";

  const ascii = base.replace(/[^\w\s.-]/g, "_").trim() || "batch";
  const utf8 = encodeURIComponent(`${base}.zip`);
  return `attachment; filename="${ascii}.zip"; filename*=UTF-8''${utf8}`;
}

/**
 * Derives a collision-free zip entry name using the original filename and the result extension.
 * Strips path separators and '..', formatting duplicates as "name (2).ext".
 */
export function sanitizeEntryFilename(originalFilename: string, outputKey: string, usedNames: Set<string>): string {
  let base = path.basename(originalFilename);
  base = base
    .replace(/[/\\]+/g, "")
    .replace(/\.\.+/g, "")
    .trim();
  if (!base) base = "image";

  const parsed = path.parse(base);
  const stem = parsed.name || "image";

  const extFromOutput = path.extname(outputKey);
  const resultExt = (extFromOutput || parsed.ext || ".jpg").toLowerCase();

  let finalName = `${stem}${resultExt}`;
  let counter = 2;
  while (usedNames.has(finalName.toLowerCase())) {
    finalName = `${stem} (${counter})${resultExt}`;
    counter++;
  }
  usedNames.add(finalName.toLowerCase());
  return finalName;
}

/**
 * Appends a readable stream to the ZipArchive, waiting until the entry has been emitted
 * before resolving so that only one MinIO stream is kept open at a time.
 */
function appendStream(
  archive: Archiver,
  stream: NodeJS.ReadableStream,
  name: string,
  onAbort?: (reject: (err: unknown) => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      archive.removeListener("entry", onEntry);
      archive.removeListener("error", onError);
      if (typeof (stream as any).removeListener === "function") {
        (stream as any).removeListener("error", onStreamError);
      }
    };

    const onEntry = (entry: { name: string }) => {
      if (entry.name === name) {
        if (!settled) {
          settled = true;
          cleanup();
          resolve();
        }
      }
    };

    const onError = (err: unknown) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    };

    const onStreamError = (err: unknown) => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    };

    if (onAbort) {
      onAbort((err) => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(err);
        }
      });
    }

    archive.on("entry", onEntry);
    archive.on("error", onError);
    if (typeof (stream as any).on === "function") {
      (stream as any).on("error", onStreamError);
    }
    archive.append(stream as any, { name });
  });
}

/**
 * POST /api/batches/:id/download-token
 * Issues a signed, 60-second token for the owner to download the whole batch as a zip stream.
 */
export async function createBatchDownloadTokenHandler(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const userId = request.authUser?.id;
    if (!userId) {
      throw unauthorized("Authentication required", "UNAUTHORIZED");
    }
    const batch = await getBatchOwnedByUser(id, userId);
    if (!batch) {
      throw notFound("Batch not found");
    }
    const token = createBatchDownloadToken(userId, id);
    const url = `/api/batches/${id}/download.zip?token=${encodeURIComponent(token)}`;
    response.status(200).json({ url });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/batches/:id/download.zip?token=...
 * Streams a zip of all COMPLETED results directly from MinIO, without buffering the archive in RAM
 * or storing a file on disk.
 */
export async function downloadBatchZipHandler(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const id = validateIdParam(request.params);
    const token = typeof request.query.token === "string" ? request.query.token : "";
    if (!token) {
      throw unauthorized("Invalid download token", "INVALID_DOWNLOAD_TOKEN");
    }

    const { userId } = verifyBatchDownloadToken(token, id);

    const batch = await getBatch(id);
    if (!batch) {
      throw notFound("Batch not found");
    }
    if (!batch.userId || batch.userId !== userId) {
      throw unauthorized("Invalid download token", "INVALID_DOWNLOAD_TOKEN");
    }

    const allJobs = await getJobsByBatchId(id);
    const completedJobs = allJobs.filter((job) => job.status === JobStatus.COMPLETED);
    if (completedJobs.length === 0) {
      throw notFound("No completed results to download", "NO_RESULTS");
    }

    response.setHeader("Content-Type", "application/zip");
    response.setHeader("Content-Disposition", buildZipContentDisposition(batch.name));

    const archive = archiver("zip", { store: true, zlib: { level: 0 } });
    archive.on("error", (err) => {
      if (!response.writableEnded) {
        response.destroy(err);
      }
    });

    let currentStream: NodeJS.ReadableStream | null = null;
    let clientAborted = false;
    let abortReject: ((err?: unknown) => void) | null = null;

    // The response's "close" means the client went away (or we finished); the request's "close" can fire as soon as
    // its (empty) body is read, so it is not a disconnect signal.
    response.on("close", () => {
      if (!response.writableEnded) {
        clientAborted = true;
        archive.abort();
        if (currentStream && typeof (currentStream as any).destroy === "function") {
          (currentStream as any).destroy();
          currentStream = null;
        }
        if (abortReject) {
          abortReject(new Error("Client aborted"));
          abortReject = null;
        }
      }
    });

    archive.pipe(response);

    const usedNames = new Set<string>();
    const missingEntries: string[] = [];

    for (const job of completedJobs) {
      if (clientAborted || response.destroyed || request.destroyed) {
        break;
      }

      const entryName = sanitizeEntryFilename(job.originalFilename, job.outputKey, usedNames);

      let streamObj = null;
      try {
        streamObj = await storage.getObjectStream(RESULTS_BUCKET, job.outputKey);
      } catch {
        streamObj = null;
      }

      if (!streamObj || !streamObj.stream) {
        missingEntries.push(entryName);
        continue;
      }

      currentStream = streamObj.stream;
      try {
        await appendStream(archive, streamObj.stream, entryName, (reject) => {
          abortReject = reject;
        });
      } catch (err) {
        if (clientAborted) break;
        throw err;
      } finally {
        abortReject = null;
        currentStream = null;
      }
    }

    if (!clientAborted) {
      if (missingEntries.length > 0) {
        const missingText = missingEntries.join("\n") + "\n";
        archive.append(missingText, { name: "MISSING.txt" });
      }
      await archive.finalize();
    }
  } catch (error) {
    // Once zip bytes are on the wire a JSON error can't be sent; cut the connection so the download shows as failed.
    if (response.headersSent) {
      console.error(`Zip download failed for batch ${request.params.id}`, error);
      response.destroy(error as Error);
      return;
    }
    next(error);
  }
}
