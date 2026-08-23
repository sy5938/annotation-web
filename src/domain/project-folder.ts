export type FolderFile = Pick<File, "name" | "type" | "webkitRelativePath">;

const exportedProjectPattern = /-annotation-project\.json$/i;
const videoExtensionPattern = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

export function selectProjectFile<T extends FolderFile>(files: readonly T[]): T {
  const preferred = files.filter((file) => exportedProjectPattern.test(file.name));
  const candidates = preferred.length > 0
    ? preferred
    : files.filter((file) => file.name.toLowerCase().endsWith(".json"));

  if (candidates.length === 0) throw new Error("所选文件夹中没有找到标定工程 JSON。");
  if (candidates.length > 1) throw new Error("所选文件夹中找到多个标定工程 JSON，请将一个工程和对应视频放在单独文件夹中。");
  return candidates[0];
}

export function findMatchingVideoFile<T extends FolderFile>(
  files: readonly T[],
  projectFile: FolderFile,
  sourceVideoName: string,
): T | null {
  const projectDirectory = directoryOf(projectFile);
  const siblings = files.filter((file) => directoryOf(file) === projectDirectory && isVideo(file));
  const expectedName = basename(sourceVideoName).toLowerCase();
  const exact = expectedName
    ? siblings.find((file) => file.name.toLowerCase() === expectedName)
    : undefined;
  if (exact) return exact;

  const projectBase = projectFile.name.replace(exportedProjectPattern, "").toLowerCase();
  return siblings.find((file) => withoutExtension(file.name).toLowerCase() === projectBase) ?? null;
}

function directoryOf(file: FolderFile): string {
  const path = file.webkitRelativePath || file.name;
  const separator = path.lastIndexOf("/");
  return separator >= 0 ? path.slice(0, separator) : "";
}

function basename(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? "";
}

function withoutExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "");
}

function isVideo(file: FolderFile): boolean {
  return file.type.startsWith("video/") || videoExtensionPattern.test(file.name);
}
