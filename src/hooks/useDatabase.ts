// src/hooks/useDatabase.ts
import { useEffect, useState } from 'react';
import { getDatabase } from '../db/database';
import { createSampleTransactionsBook } from '../db/repositories/sampleTransactionsRepo';

export function useDatabase() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await getDatabase();
        if (__DEV__) {
          try {
            await createSampleTransactionsBook();
          } catch (sampleError) {
            console.warn('Buku Contoh belum dapat dibuat.', sampleError);
          }
        }
        if (mounted) {
          setIsReady(true);
        }
      } catch (err: any) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, [attempt]);

  return { isReady, error, retry: () => { setError(null); setAttempt((count) => count + 1); } };
}

