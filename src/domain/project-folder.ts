export type FolderFile = Pick<File, "name" | "type" | "webkitRelativePath">;

const exportedProjectPattern = /-annotation-project\.json$/i;
const videoExtensionPattern = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

export function listProjectFiles<T extends FolderFile>(files: readonly T[]): T[] {
  const preferred = files.filter((file) => exportedProjectPattern.test(file.name));
  return preferred.length > 0
    ? preferred
    : files.filter((file) => file.name.toLowerCase().endsWith(".json"));
}

export function findMatchingVideoFile<T extends FolderFile>(
  files: readonly T[],
  projectFile: FolderFile,
  sourceVideoName: string,
): T | null {
  const videos = files.filter(isVideo);
  const expectedName = basename(sourceVideoName).toLowerCase();
  const exact = expectedName
    ? videos.filter((file) => file.name.toLowerCase() === expectedName)
    : [];
  if (exact.length > 1) throw new Error(`工作文件夹中找到多个同名视频“${basename(sourceVideoName)}”，请保留唯一文件。`);
  if (exact.length === 1) return exact[0];

  const projectBase = projectFile.name.replace(exportedProjectPattern, "").toLowerCase();
  const fallback = videos.filter((file) => withoutExtension(file.name).toLowerCase() === projectBase);
  if (fallback.length > 1) throw new Error(`工作文件夹中找到多个与工程同名的视频“${projectBase}”，请保留唯一文件。`);
  return fallback[0] ?? null;
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
