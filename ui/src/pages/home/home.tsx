import React, { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Button, Divider, Empty, Progress } from "antd";

import LayoutComponent from "../../components/layout";
import { listFolder } from "../../services/folder";
import "../../components/components.css";
import "./home.css";
import AddFolder from "./modals/addFolderModal";
import FolderComponent from "../../components/folder/folder";
import FileComponent from "../../components/folder/file";
import {
  deleteFile,
  getDownloadURL,
  getFolderDownloadStatus,
  startFolderDownload,
  FolderDownloadStatus,
} from "../../services/file";
import UploadFile from "./modals/uploadFileModal";
import DeleteFolder from "./modals/deleteFolderModal";
import { isMobile } from "react-device-detect";
import {
  showErrorMessage,
  showSuccessMessage,
} from "../../services/common";

interface File {
  fileName: string;
  content: any;
  _id: string;
}
interface Folder {
  folderName: string;
  folders: Folder[];
  path: string;
  files: File[];
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const Home: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [folderInfo, setFolderInfo] = useState<Folder>();
  const [folderLoading, setFolderLoading] = useState(false);
  const [previousPath, setPreviousPath] = useState("");
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<FolderDownloadStatus | null>(null);
  const params = useParams();

  const getCurrentPath = useCallback(
    () => searchParams.get("path") || "/root",
    [searchParams]
  );

  const handleFolderClick = (path: string) => setSearchParams({ path });

  const handleDownload = async (file: File) => {
    try {
      const response = await getDownloadURL(file.content.file_id);
      window.location.href = response.url;
    } catch (error: any) {
      showErrorMessage("Download failed", error?.response?.data?.message || error.message);
    }
  };

  const handleDownloadFolder = async () => {
    if (downloadBusy) return;
    setDownloadBusy(true);
    setDownloadStatus(null);

    try {
      const { jobId } = await startFolderDownload(getCurrentPath());
      let status: FolderDownloadStatus;
      do {
        status = await getFolderDownloadStatus(jobId);
        setDownloadStatus(status);
        if (status.status === "queued" || status.status === "downloading") {
          await sleep(1000);
        }
      } while (status.status === "queued" || status.status === "downloading");

      if (status.status === "completed") {
        showSuccessMessage(
          `Folder download complete (${status.completed}/${status.total}). Saved to ${status.outputDirectory}`
        );
      } else {
        showErrorMessage(
          "Folder download finished with errors",
          `${status.completed}/${status.total} files downloaded. ${status.errors.length} failed. Saved to ${status.outputDirectory}`
        );
      }
    } catch (error: any) {
      showErrorMessage(
        "Folder download failed",
        error?.response?.data?.message || error.message || "Could not download folder"
      );
    } finally {
      setDownloadBusy(false);
    }
  };

  const handleDelete = async (file: File) => {
    try {
      await deleteFile(
        getCurrentPath(),
        file.content.file_id,
        file.content.message_id
      );
      if (folderInfo) {
        setFolderInfo({
          ...folderInfo,
          files: folderInfo.files.filter((storedFile) => storedFile._id !== file._id),
        });
      }
    } catch (_error) {
      showErrorMessage("An error occurred", "Error while deleting the file!");
    }
  };

  const updateFolder = (path: string) => {
    setFolderLoading(true);
    listFolder(path)
      .then((data) => setFolderInfo(data as any))
      .catch((error: any) =>
        showErrorMessage("Unable to load folder", error?.message || "Request failed")
      )
      .finally(() => setFolderLoading(false));
  };

  useEffect(() => {
    const path = getCurrentPath();
    if (previousPath !== path) {
      setPreviousPath(path);
      updateFolder(path);
    }
  }, [params, getCurrentPath, previousPath]);

  const percent = downloadStatus?.total
    ? Math.round((downloadStatus.completed / downloadStatus.total) * 100)
    : downloadStatus?.status === "completed" ? 100 : 0;

  return (
    <LayoutComponent
      path={folderInfo?.path}
      loading={folderLoading}
      actions={
        <div className={isMobile ? "header-btns" : ""}>
          <Button
            style={{ marginLeft: 10 }}
            type="primary"
            ghost
            loading={downloadBusy}
            onClick={handleDownloadFolder}
          >
            {downloadBusy ? "Downloading folder…" : "Download Folder"}
          </Button>
          <AddFolder updateList={setFolderInfo} />
          <UploadFile updateList={setFolderInfo} />
          <DeleteFolder updateList={setFolderInfo} />
          {downloadStatus && (
            <div style={{ minWidth: 240, maxWidth: 420, margin: "12px 0" }}>
              <Progress percent={percent} status={downloadStatus.status === "failed" ? "exception" : undefined} />
              <div>
                {downloadStatus.status === "completed" || downloadStatus.status === "completed_with_errors"
                  ? `Finished: ${downloadStatus.completed}/${downloadStatus.total}`
                  : `Downloading ${downloadStatus.currentFile || "preparing"}: ${downloadStatus.completed}/${downloadStatus.total}`}
              </div>
            </div>
          )}
        </div>
      }
    >
      {!folderInfo?.folders?.length && !folderInfo?.files?.length && (
        <Empty description="Empty folder" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      )}
      {!!folderInfo?.folders?.length && <Divider />}
      <div className={isMobile ? "center" : ""}>
        {folderInfo?.folders?.map((folder) => (
          <FolderComponent
            key={folder.folderName}
            onClick={() => handleFolderClick(folder.path)}
            folderName={folder.folderName}
          />
        ))}
      </div>

      {!!folderInfo?.files?.length && <Divider />}
      <div className={isMobile ? "center" : ""}>
        {folderInfo?.files?.map((file) => (
          <FileComponent
            key={file._id}
            onDownload={() => handleDownload(file)}
            onDelete={() => handleDelete(file)}
            fileName={file.fileName}
            thumbnail={file.content?.thumb?.file_id}
            file={file}
          />
        ))}
      </div>
    </LayoutComponent>
  );
};

export default Home;
