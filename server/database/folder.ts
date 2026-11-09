import mongoose from "mongoose";
const Schema = mongoose.Schema;

const FileSchema = new Schema({
  fileName: String,
  content: Object,
});

export const FolderSchema = new Schema(
  {
    folderName: {
      type: String,
      required: [true, "foldername is required!"],
    },
    path: String, // eg: /user/folderA/folderB
    folders: [Schema.Types.Mixed],
    files: [FileSchema],
    lastModified: Date,
    created: Date,
    owner: Schema.Types.ObjectId,
    parentFolder: Schema.Types.ObjectId,
  },
  {
    strict: false,
  }
);

export interface FolderDTO {
  folderName: string;
  path: string;
  folders: FolderDTO[];
  files: string[];
  lastModified: Date;
  created: Date;
  owner: mongoose.Types.ObjectId;
}

const removeTrailingSlash = (path: string) => {
  return path.slice(-1)[0] === "/" ? path.slice(0, -1) : path;
};

export const FolderModel = mongoose.model(`FolderModel`, FolderSchema);

export const makeFolderModel = async (
  owner: mongoose.Types.ObjectId,
  path: string,
  folderName: string,
  parentFolder: mongoose.Types.ObjectId
) => {
  path = removeTrailingSlash(path);
  const folder = new FolderModel({
    folderName,
    path: `${path}/${folderName}`,
    lastModified: new Date(),
    created: new Date(),
    folders: [],
    files: [],
    owner,
    parentFolder,
  });
  await folder.save();
  return folder;
};

export const listFolder = async (
  owner: mongoose.Types.ObjectId,
  path: string
): Promise<FolderDTO> => {
  if (!owner || !path) throw new Error("Owner and path are required!");
  path = removeTrailingSlash(path);
  const FolderModel = mongoose.model(`FolderModel`, FolderSchema);
  const folder = await FolderModel.findOne({ path, owner }).populate("folders");
  if (!folder) throw new Error("Folder not found!");
  return folder.toJSON() as FolderDTO;
};

export const makeFolder = async (
  owner: mongoose.Types.ObjectId,
  path: string,
  folderName: string
): Promise<FolderDTO> => {
  if (!owner || !path || !folderName)
    throw new Error("Owner, path and folderName are required!");
  const FolderModel = mongoose.model(`FolderModel`, FolderSchema);
  path = removeTrailingSlash(path);
  const folder = await FolderModel.findOne({ path, owner });
  if (!folder) throw new Error("Folder not found!");
  if (folder.folders.find((child) => child.folderName === folderName)) {
    throw new Error(`Folder '${folderName}' already exists on path '${path}'`);
  }
  const subFolder = await makeFolderModel(owner, path, folderName, folder._id);
  folder.folders.push(subFolder as any);
  folder.lastModified = new Date();
  await folder.save();
  return folder.toJSON() as FolderDTO;
};

const getAllDocsToBeDeleted = async (
  parentId: mongoose.Types.ObjectId,
  accumulator: mongoose.Types.ObjectId[]
) => {
  const parent = await FolderModel.findOne({ _id: parentId }).populate("folders");
  if (!parent) return;
  const children = parent.folders;
  accumulator.push(...children.map((child) => child._id));
  for (const child of children) {
    await getAllDocsToBeDeleted(child._id, accumulator);
  }
  return accumulator;
};

export const removeFolder = async (
  owner: mongoose.Types.ObjectId,
  path: string
): Promise<any> => {
  if (!owner || !path) throw new Error("Owner and path are required!");
  path = removeTrailingSlash(path);
  if (path === "/root") throw new Error("Root folder cannot be deleted!");

  const folder = await FolderModel.findOne({ path, owner }).populate("folders");
  if (!folder) throw new Error("Folder not found!");

  if (folder.parentFolder) {
    const parent = await FolderModel.findOne({ _id: folder.parentFolder }).populate("folders");
    if (parent) {
      const childIndex = parent.folders.findIndex(
        (child) => child._id.toString() === folder._id.toString()
      );
      if (childIndex >= 0) {
        parent.folders.splice(childIndex, 1);
        await parent.save();
      }
    }
  }

  const ids = await getAllDocsToBeDeleted(folder._id, [folder._id]);
  return FolderModel.deleteMany({ _id: { $in: ids } });
};

export const addFile = async (
  owner: mongoose.Types.ObjectId,
  path: string,
  fileName: string,
  fileContent: any
) => {
  if (!owner || !path || !fileName || !fileContent)
    throw new Error("Owner, path and fileContent are required!");

  path = removeTrailingSlash(path);
  const folder = await FolderModel.findOne({ path, owner });
  if (!folder) throw new Error("Folder not found!");

  folder.files.push({ fileName, content: fileContent } as any);
  folder.lastModified = new Date();
  return folder.save();
};

export const removeFile = async (
  owner: mongoose.Types.ObjectId,
  path: string,
  fileId: mongoose.Types.ObjectId
) => {
  if (!owner || !path || !fileId)
    throw new Error("Owner, path and fileId are required!");

  path = removeTrailingSlash(path);
  const folder = await FolderModel.findOne({ path, owner });
  if (!folder) throw new Error("Folder not found!");

  const deleteFileIndex = folder.files.findIndex(
    (storedFile) => storedFile._id.toString() === fileId.toString()
  );
  if (deleteFileIndex < 0) throw new Error("File not found in this folder");

  folder.files.splice(deleteFileIndex, 1);
  folder.lastModified = new Date();
  return folder.save();
};
