import { runDoctor, toDoctorText } from '../../src/doctorCommand';
import type { DoctorReport } from '../../src/doctorCommand';
import type { CsvPilotOptions } from '../../src/types';

jest.mock('../../src/commandCommon', () => ({
    resolveToken: jest.fn(),
}));

jest.mock('../../src/planCommand', () => ({
    createExecutionPlan: jest.fn(),
}));

import { resolveToken } from '../../src/commandCommon';
import { createExecutionPlan } from '../../src/planCommand';

const mockResolveToken = resolveToken as jest.Mock;
const mockCreateExecutionPlan = createExecutionPlan as jest.Mock;

/**
 * テスト用のベースオプションを生成する
 * @returns CsvPilotOptions
 */
function baseOptions(): CsvPilotOptions {
    return {
        prompts: [],
        input: [],
        output: '/tmp/out',
        mode: 'record',
        delimiter: ',',
    };
}

describe('doctorCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCreateExecutionPlan.mockResolvedValue({ errors: [], plannedOutputs: [] });
    });

    describe('runDoctor', () => {
        it('Node.js バージョンが 18 以上なら node チェックが pass になる', async () => {
            mockResolveToken.mockReturnValue('token');
            const report = await runDoctor(baseOptions());
            const nodeResult = report.checks.find(c => c.item === 'node');
            expect(nodeResult).toBeDefined();
            expect(nodeResult!.status).toBe('pass');
        });

        it('トークンが存在する場合 token チェックが pass になる', async () => {
            mockResolveToken.mockReturnValue('my-token');
            const report = await runDoctor(baseOptions());
            const tokenResult = report.checks.find(c => c.item === 'token');
            expect(tokenResult!.status).toBe('pass');
        });

        it('トークンが存在しない場合 token チェックが warn になる', async () => {
            mockResolveToken.mockReturnValue(undefined);
            const report = await runDoctor(baseOptions());
            const tokenResult = report.checks.find(c => c.item === 'token');
            expect(tokenResult!.status).toBe('warn');
        });

        it('plan にエラーがある場合 paths/prompts チェックが fail になる', async () => {
            mockResolveToken.mockReturnValue('token');
            mockCreateExecutionPlan.mockResolvedValue({ errors: [{ code: 'SOME_ERROR' }], plannedOutputs: [] });
            const report = await runDoctor(baseOptions());
            const pathsResult = report.checks.find(c => c.item === 'paths/prompts');
            expect(pathsResult!.status).toBe('fail');
        });

        it('plan にエラーがない場合 paths/prompts チェックが pass になる', async () => {
            mockResolveToken.mockReturnValue('token');
            const report = await runDoctor(baseOptions());
            const pathsResult = report.checks.find(c => c.item === 'paths/prompts');
            expect(pathsResult!.status).toBe('pass');
        });

        it('byok.provider があり model がない場合 model チェックが fail になる', async () => {
            mockResolveToken.mockReturnValue('token');
            const options: CsvPilotOptions = {
                ...baseOptions(),
                byok: { provider: { type: 'azure', baseUrl: 'https://example.com' } },
            };
            const report = await runDoctor(options);
            const modelResult = report.checks.find(c => c.item === 'model');
            expect(modelResult!.status).toBe('fail');
        });

        it('model が指定されている場合 model チェックが pass になる', async () => {
            mockResolveToken.mockReturnValue('token');
            const options: CsvPilotOptions = {
                ...baseOptions(),
                model: 'gpt-4',
                byok: { provider: { type: 'azure', baseUrl: 'https://example.com' } },
            };
            const report = await runDoctor(options);
            const modelResult = report.checks.find(c => c.item === 'model');
            expect(modelResult!.status).toBe('pass');
        });

        it('proxy が設定されている場合 proxy チェックが追加される', async () => {
            mockResolveToken.mockReturnValue('token');
            const options: CsvPilotOptions = {
                ...baseOptions(),
                proxy: { http: 'http://proxy:8080' },
            };
            const report = await runDoctor(options);
            const proxyResult = report.checks.find(c => c.item === 'proxy');
            expect(proxyResult!.status).toBe('pass');
        });
    });

    describe('toDoctorText', () => {
        it('pass チェックを正しくフォーマットする', () => {
            const report: DoctorReport = {
                checks: [{ item: 'node', status: 'pass', detail: '20.0.0' }],
            };
            const text = toDoctorText(report);
            expect(text).toBe('[pass] node (20.0.0)');
        });

        it('fail チェックと remediation を正しくフォーマットする', () => {
            const report: DoctorReport = {
                checks: [{ item: 'token', status: 'fail', remediation: 'tokenを設定してください。' }],
            };
            const text = toDoctorText(report);
            expect(text).toBe('[fail] token / fix: tokenを設定してください。');
        });

        it('複数チェックを改行区切りで出力する', () => {
            const report: DoctorReport = {
                checks: [
                    { item: 'node', status: 'pass' },
                    { item: 'token', status: 'warn', remediation: 'fix me' },
                ],
            };
            const lines = toDoctorText(report).split('\n');
            expect(lines).toHaveLength(2);
        });
    });
});
