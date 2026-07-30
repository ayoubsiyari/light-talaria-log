import { useCallback, useRef, useState } from 'react';
import { assessCsvUpload } from '@/datasets/ingestLimits';
import { CHUNK_SIZE } from '@/utils/constants';
import type { CsvWorkerResponse, DatasetMeta } from '@/types/bar';
import { openDb, putChunk } from '@/data/idbStore';

export interface ImportState {
  status: 'idle' | 'importing' | 'done' | 'error';
  progress: number;
  rowsParsed: number;
  error?: string;
  meta?: DatasetMeta;
}

/**
 * Phase 2: CSV import via Web Worker → IndexedDB.
 */
export function useCsvImport() {
  const workerRef = useRef<Worker | null>(null);
  const [state, setState] = useState<ImportState>({
    status: 'idle',
    progress: 0,
    rowsParsed: 0,
  });

  const importCsv = useCallback(async (file: File, symbol = 'SYMBOL') => {
    const assess = assessCsvUpload(file);
    if (assess.level === 'block') {
      setState({
        status: 'error',
        progress: 0,
        rowsParsed: 0,
        error: assess.error ?? 'CSV rejected by size limits.',
      });
      return;
    }
    if (assess.level === 'confirm') {
      const ok = window.confirm(
        `${assess.message}\n\nImport may take a while and use significant disk space. Continue?`,
      );
      if (!ok) {
        setState({ status: 'idle', progress: 0, rowsParsed: 0 });
        return;
      }
    }

    setState({ status: 'importing', progress: 0, rowsParsed: 0 });

    const csvText = await file.text();
    const worker = new Worker(new URL('@/data/csvWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    const db = await openDb();

    worker.onmessage = async (e: MessageEvent<CsvWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        setState((s) => ({
          ...s,
          progress: msg.percent,
          rowsParsed: msg.rowsParsed,
        }));
      } else if (msg.type === 'chunkStored' && msg.buffer) {
        await putChunk(db, msg.chunkId, msg.buffer);
      } else if (msg.type === 'done') {
        setState({ status: 'done', progress: 1, rowsParsed: msg.meta.rowCount, meta: msg.meta });
        worker.terminate();
        workerRef.current = null;
      } else if (msg.type === 'error') {
        setState({ status: 'error', progress: 0, rowsParsed: 0, error: msg.message });
        worker.terminate();
        workerRef.current = null;
      }
    };

    worker.postMessage({ type: 'parse', csvText, symbol, chunkSize: CHUNK_SIZE });
  }, []);

  const cancel = useCallback(() => {
    workerRef.current?.postMessage({ type: 'cancel' });
    workerRef.current?.terminate();
    workerRef.current = null;
    setState({ status: 'idle', progress: 0, rowsParsed: 0 });
  }, []);

  return { state, importCsv, cancel };
}
