import { requireOptionalNativeModule } from 'expo';
import type { Directory, File as NativeFile } from 'expo-file-system';
import { Platform } from 'react-native';

export const SQLITE_MIME_TYPE = 'application/vnd.sqlite3';
const SQLITE_HEADER = 'SQLite format 3\0';
const SQLITE_FILE_TYPES = [SQLITE_MIME_TYPE, 'application/x-sqlite3', 'application/x-sqlite', 'application/octet-stream'];

type StagedFile = {
  filename: string;
  directory: string;
  dispose: () => void;
};

export type BackupInput =
  | { kind: 'sqlite'; bytes: Uint8Array<ArrayBuffer> }
  | ({ kind: 'sqlite-file' } & StagedFile);

type FileContents = {
  bytes: () => Promise<Uint8Array>;
  writeToCache?: (filename: string, directory: string) => Promise<void>;
};

async function getFileSystem() {
  const native = requireOptionalNativeModule<{ pickDirectoryAsync?: unknown; pickFileAsync?: unknown }>('FileSystem');
  if (typeof native?.pickDirectoryAsync !== 'function' || typeof native.pickFileAsync !== 'function') {
    throw new Error('Pemilih berkas belum tersedia pada versi aplikasi ini.');
  }
  return import('expo-file-system');
}

function isPickerCancellation(error: unknown): boolean {
  return typeof error === 'object' && error !== null
    && 'code' in error && error.code === 'ERR_PICKER_CANCELLED';
}

function removeTemporaryFile(file: Directory | NativeFile) {
  try {
    if (file.exists) file.delete();
  } catch {
    // A cache cleanup failure should not mask the result of the operation.
  }
}

function makeStagingDirectory(fileSystem: Awaited<ReturnType<typeof getFileSystem>>) {
  const directory = new fileSystem.Directory(
    fileSystem.Paths.cache, `kaskuy-data-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );
  directory.create();
  return directory;
}

async function copyToNewFile(
  source: NativeFile, destination: NativeFile,
  fileMode: typeof import('expo-file-system').FileMode
) {
  const reader = source.open(fileMode.ReadOnly);
  try {
    const writer = destination.open(fileMode.WriteOnly);
    try {
      let chunk = reader.readBytes(256 * 1024);
      let chunksWritten = 0;
      while (chunk.length > 0) {
        writer.writeBytes(chunk);
        if (++chunksWritten % 16 === 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
        }
        chunk = reader.readBytes(256 * 1024);
      }
    } finally {
      writer.close();
    }
  } finally {
    reader.close();
  }
}

export async function saveDataFile(filename: string, mime: string, contents: FileContents): Promise<boolean> {
  if (Platform.OS === 'web') {
    const blob = new Blob([new Uint8Array(await contents.bytes())], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  const fs = await getFileSystem();
  let directory: Directory;
  try {
    directory = await fs.Directory.pickDirectoryAsync();
  } catch (error) {
    if (isPickerCancellation(error)) return false;
    throw error;
  }

  let staging: Directory | undefined;
  let destination: NativeFile | undefined;
  try {
    if (contents.writeToCache) {
      staging = makeStagingDirectory(fs);
      await contents.writeToCache(filename, staging.uri);
      destination = directory.createFile(filename, mime);
      await copyToNewFile(new fs.File(staging, filename), destination, fs.FileMode);
    } else {
      const bytes = await contents.bytes();
      destination = directory.createFile(filename, mime);
      destination.write(bytes);
    }
    return true;
  } catch (error) {
    if (destination) removeTemporaryFile(destination);
    throw error;
  } finally {
    if (staging) removeTemporaryFile(staging);
  }
}

function pickWebFile(): Promise<globalThis.File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.sqlite,.sqlite3,.db';
    input.hidden = true;
    const finish = (file: globalThis.File | null) => {
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function assertSqliteHeader(header: Uint8Array) {
  if (String.fromCharCode(...header) !== SQLITE_HEADER) {
    throw new Error('Pilih file cadangan SQLite (.sqlite) yang dibuat KASKUY.');
  }
}

export async function pickBackupFile(): Promise<BackupInput | null> {
  if (Platform.OS === 'web') {
    const selected = await pickWebFile();
    if (!selected) return null;
    const header = new Uint8Array(await selected.slice(0, SQLITE_HEADER.length).arrayBuffer());
    assertSqliteHeader(header);
    return { kind: 'sqlite', bytes: new Uint8Array(await selected.arrayBuffer()) };
  }

  const fs = await getFileSystem();
  const picked = await fs.File.pickFileAsync({ mimeTypes: SQLITE_FILE_TYPES });
  if (picked.canceled) return null;

  const staging = makeStagingDirectory(fs);
  const filename = 'cadangan.sqlite';
  const localFile = new fs.File(staging, filename);
  const dispose = () => removeTemporaryFile(staging);
  try {
    await picked.result.copy(localFile);
    const reader = localFile.open(fs.FileMode.ReadOnly);
    try {
      assertSqliteHeader(reader.readBytes(SQLITE_HEADER.length));
    } finally {
      reader.close();
    }
    return { kind: 'sqlite-file', filename, directory: staging.uri, dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export function disposeBackupFile(input: BackupInput | null) {
  if (input?.kind === 'sqlite-file') input.dispose();
}
