import * as fs from 'fs';
import { runWithOptionalPlan } from '../../src/runCommand';
import type { CsvPilotOptions } from '../../src/types';

jest.mock('../../src/orchestrator', () => ({
    run: jest.fn(),
}));

jest.mock('fs');

import { run } from '../../src/orchestrator';

const mockRun = run as jest.Mock;
const mockReadFileSync = fs.readFileSync as jest.Mock;

/**
 * テスト用ベースオプションを生成する
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

describe('runCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRun.mockResolvedValue(undefined);
    });

    describe('runWithOptionalPlan', () => {
        it('planPath が未指定の場合は run(options) を呼ぶ', async () => {
            const options = baseOptions();
            await runWithOptionalPlan(options);
            expect(mockRun).toHaveBeenCalledWith(options);
        });

        it('planPath が指定された場合は plan の resolvedOptions で run を呼ぶ', async () => {
            const resolvedOptions = { ...baseOptions(), output: '/resolved/out' };
            const plan = { planId: 'plan-123', resolvedOptions };
            mockReadFileSync.mockReturnValue(JSON.stringify(plan));
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

            await runWithOptionalPlan(baseOptions(), '/path/to/plan.json');

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/plan.json', 'utf-8');
            expect(mockRun).toHaveBeenCalledWith(resolvedOptions);
            consoleSpy.mockRestore();
        });

        it('planPath が指定された場合は planId をログに出力する', async () => {
            const plan = { planId: 'plan-abc', resolvedOptions: baseOptions() };
            mockReadFileSync.mockReturnValue(JSON.stringify(plan));
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

            await runWithOptionalPlan(baseOptions(), '/path/to/plan.json');

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('plan-abc'));
            consoleSpy.mockRestore();
        });
    });
});
