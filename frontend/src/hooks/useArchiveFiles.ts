import { useEffect, useState } from 'react';
import { listArchiveFiles } from '../api/notesApi';
import type { ArchiveFileInfo } from '../api/noteTypes';

/**
 * Die bereits abgesendeten Notizen (2_ai-ready/notes), neueste zuerst -
 * sortiert wird serverseitig. reloadToken laesst die Liste nach einem
 * Absenden neu laden, damit die gerade entstandene Notiz sofort auftaucht.
 */
export function useArchiveFiles(reloadToken: number = 0) {
  const [files, setFiles] = useState<ArchiveFileInfo[]>([]);

  useEffect(() => {
    listArchiveFiles()
      .then(setFiles)
      .catch(() => setFiles([]));
  }, [reloadToken]);

  return files;
}
