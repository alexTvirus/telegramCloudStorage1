import { makeRequest, showErrorMessage } from "./common";
import { DELETE_FILE, DOWNLOAD_FILE_URL, DOWNLOAD_FOLDER } from "./endpoints";

export const getDownloadURL = async (fileId: string) => {
  const request = await makeRequest(DOWNLOAD_FILE_URL, "GET", {
    queryParams: { fileId },
  });
  return request.data;
};

export const startFolderDownload = async (path: string) => {
  const request = await makeRequest(DOWNLOAD_FOLDER, "POST", {
    body: { path },
  });
  return request.data as { jobId: string; total: number };
};

export interface FolderDownloadStatus {
  status: "queued" | "downloading" | "completed" | "completed_with_errors" | "failed";
  total: number;
  completed: number;
  currentFile: string | null;
  outputDirectory: string;
  errors: Array<{ fileName: string; message: string }>;
}

export const getFolderDownloadStatus = async (jobId: string) => {
  const request = await makeRequest(`${DOWNLOAD_FOLDER}/${jobId}`, "GET");
  return request.data as FolderDownloadStatus;
};

export const deleteFile = async (
  path: string,
  fileId: string,
  messageId: string
) => {
  try {
    const request = await makeRequest(DELETE_FILE, "POST", {
      body: { path, fileId, messageId },
    });
    return request.data;
  } catch (error: any) {
    showErrorMessage("Delete file error", error?.response?.data?.message || error.message);
    throw error;
  }
};
