import express from "express";
import { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import {
  downloadDocument,
  getDownloadURL,
  removeDocument,
  uploadDocument,
} from "../../bot";
import { injectOwnerId } from "../middlewares";
import { addFile, listFolder, removeFile } from "../../database/folder";
import mongoose from "mongoose";
import {
  FILE_STORAGE_PATH,
  LOCAL_DOWNLOADS_PATH,
} from "../../constants";
import { download as downloadFile } from "../../request";
import { runTelegramRequest } from "../../telegramQueue";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    fs.mkdirSync(FILE_STORAGE_PATH, { recursive: true });
    cb(null, FILE_STORAGE_PATH);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ dest: FILE_STORAGE_PATH, storage });
const file = express.Router();
file.use(injectOwnerId);

interface DownloadJob {
  id: string;
  owner: string;
  status: "queued" | "downloading" | "completed" | "completed_with_errors" | "failed";
  total: number;
  completed: number;
  currentFile: string | null;
  outputDirectory: string;
  errors: Array<{ fileName: string; message: string }>;
  updatedAt: number;
}

const downloadJobs = new Map<string, DownloadJob>();
const cleanExpiredJobs = () => {
  const expiration = Date.now() - 6 * 60 * 60 * 1000;
  downloadJobs.forEach((job, id) => {
    if (job.updatedAt < expiration) downloadJobs.delete(id);
  });
};

const safePathSegment = (value: string) => {
  const safe = path
    .basename(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "_")
    .trim();
  return safe || "folder";
};

const safeFileName = (value: string) => {
  const safe = path
    .basename(value || "file")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/^\.+$/, "_")
    .trim();
  return safe || "file";
};

const uniqueFilePath = (directory: string, fileName: string) => {
  const parsed = path.parse(safeFileName(fileName));
  let candidate = path.join(directory, parsed.base);
  let suffix = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name} (${suffix++})${parsed.ext}`);
  }
  return candidate;
};

const runFolderDownload = async (
  job: DownloadJob,
  files: any[],
  token: string
) => {
  job.status = "downloading";
  job.updatedAt = Date.now();

  for (const storedFile of files) {
    const fileName = safeFileName(storedFile.fileName);
    job.currentFile = fileName;
    job.updatedAt = Date.now();

    try {
      const fileId = storedFile?.content?.file_id;
      if (!fileId) throw new Error("Telegram file_id is missing");

      const telegramFilePath = await downloadDocument(fileId, token);
      const url = getDownloadURL(telegramFilePath, token);
      const destination = uniqueFilePath(job.outputDirectory, fileName);
      await runTelegramRequest(token, () => downloadFile(url, destination));
      job.completed += 1;
    } catch (error: any) {
      job.errors.push({
        fileName,
        message: error?.message || String(error),
      });
    }
    job.updatedAt = Date.now();
  }

  job.currentFile = null;
  job.status = job.errors.length ? "completed_with_errors" : "completed";
  job.updatedAt = Date.now();
};

file.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  const tempFilePath = req.file?.path;
  try {
    if (!req.file) throw new Error("No file was uploaded");

    const chatId = req.headers.chatId as string;
    const token = req.headers.token as string;
    const owner = req.headers.owner as string;
    const data = fs.readFileSync(req.file.path);
    const response = await uploadDocument(
      data,
      req.file.originalname,
      token,
      chatId
    );
    const updatedFolder = await addFile(
      new mongoose.Types.ObjectId(owner),
      req.body.path,
      req.file.originalname,
      {
        ...(response.document || response.sticker),
        message_id: response.message_id,
      }
    );
    res.send(updatedFolder);
  } catch (error: any) {
    res.status(500).send({ e: error, message: error?.message });
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlink(tempFilePath, (error) => {
        if (error) console.log(`Unable to remove temp file: ${tempFilePath}!`);
      });
    }
  }
});

file.get("/download", async (req: Request, res: Response) => {
  try {
    const token = req.headers.token as string;
    const filePath = await downloadDocument(req.query.fileId, token);
    res.send({ url: getDownloadURL(filePath, token) });
  } catch (error: any) {
    res.status(500).send({ e: error, message: error?.message });
  }
});

file.post("/remove", async (req: Request, res: Response) => {
  try {
    const token = req.headers.token as string;
    const owner = req.headers.owner as string;
    const chatId = req.headers.chatId as string;
    const { path: folderPath, fileId, messageId } = req.body;

    // Do not remove the MongoDB record unless Telegram confirms deletion.
    const telegramDeleted = await removeDocument(messageId, token, chatId);
    if (telegramDeleted !== true) {
      throw new Error("Telegram did not confirm message deletion");
    }

    await removeFile(
      new mongoose.Types.ObjectId(owner),
      folderPath,
      new mongoose.Types.ObjectId(fileId)
    );
    res.send({ deleted: true });
  } catch (error: any) {
    res.status(500).send({ e: error, message: error?.message });
  }
});

file.post("/download-folder", async (req: Request, res: Response) => {
  try {
    cleanExpiredJobs();
    const owner = req.headers.owner as string;
    const token = req.headers.token as string;
    const folderPath = req.body.path || "/root";
    const folder = await listFolder(
      new mongoose.Types.ObjectId(owner),
      folderPath
    );
    const files = folder.files || [];
    const folderName = safePathSegment(folder.folderName);
    const outputDirectory = path.resolve(
      LOCAL_DOWNLOADS_PATH,
      safePathSegment(owner),
      folderName
    );
    fs.mkdirSync(outputDirectory, { recursive: true });

    const job: DownloadJob = {
      id: crypto.randomBytes(16).toString("hex"),
      owner,
      status: "queued",
      total: files.length,
      completed: 0,
      currentFile: null,
      outputDirectory,
      errors: [],
      updatedAt: Date.now(),
    };
    downloadJobs.set(job.id, job);

    void runFolderDownload(job, files, token).catch((error: any) => {
      job.status = "failed";
      job.currentFile = null;
      job.errors.push({ fileName: "", message: error?.message || String(error) });
      job.updatedAt = Date.now();
    });

    res.status(202).send({ jobId: job.id, total: job.total });
  } catch (error: any) {
    res.status(500).send({ e: error, message: error?.message });
  }
});

file.get("/download-folder/:jobId", (req: Request, res: Response) => {
  cleanExpiredJobs();
  const job = downloadJobs.get(req.params.jobId);
  if (!job || job.owner !== req.headers.owner) {
    res.status(404).send({ message: "Download job not found" });
    return;
  }

  res.send({
    status: job.status,
    total: job.total,
    completed: job.completed,
    currentFile: job.currentFile,
    outputDirectory: path.relative(process.cwd(), job.outputDirectory),
    errors: job.errors,
  });
});

export default file;
