#!/usr/bin/env node
import { createCli } from './cli';

createCli().parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[CsvPilot] 起動エラー: ${msg}`);
  process.exit(1);
});
