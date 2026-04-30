import { loadCsvRecords } from './csvProcessor';
import { loadJsonOrYaml } from './commandCommon';

interface RowCountRule {
  equals?: number;
  min?: number;
  max?: number;
}

interface VerifyRules {
  requiredColumns?: string[];
  rowCount?: RowCountRule;
}

interface VerifySpec {
  rules?: VerifyRules;
}

export interface VerifyIssue {
  file: string;
  rule: string;
  message: string;
}

export interface VerifyReport {
  passed: boolean;
  issues: VerifyIssue[];
}

export async function runVerify(actualFiles: string[], specPath: string, delimiter: string): Promise<VerifyReport> {
  const parsed = loadJsonOrYaml(specPath) as VerifySpec;
  const rules = parsed.rules ?? {};
  const issues: VerifyIssue[] = [];

  for (const file of actualFiles) {
    const { headers, records } = await loadCsvRecords(file, delimiter);

    if (rules.requiredColumns) {
      for (const col of rules.requiredColumns) {
        if (!headers.includes(col)) {
          issues.push({
            file,
            rule: 'requiredColumns',
            message: `必須列が不足: ${col}`,
          });
        }
      }
    }

    if (rules.rowCount?.equals !== undefined && records.length !== rules.rowCount.equals) {
      issues.push({
        file,
        rule: 'rowCount.equals',
        message: `行数不一致: expected=${rules.rowCount.equals}, actual=${records.length}`,
      });
    }

    if (rules.rowCount?.min !== undefined && records.length < rules.rowCount.min) {
      issues.push({
        file,
        rule: 'rowCount.min',
        message: `行数が最小未満: min=${rules.rowCount.min}, actual=${records.length}`,
      });
    }

    if (rules.rowCount?.max !== undefined && records.length > rules.rowCount.max) {
      issues.push({
        file,
        rule: 'rowCount.max',
        message: `行数が最大超過: max=${rules.rowCount.max}, actual=${records.length}`,
      });
    }
  }

  return { passed: issues.length === 0, issues };
}

export function toVerifyText(report: VerifyReport): string {
  if (report.passed) return '[verify] passed';
  return ['[verify] failed', ...report.issues.map(i => `- ${i.file} ${i.rule}: ${i.message}`)].join('\n');
}
