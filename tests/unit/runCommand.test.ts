import * as fs from 'fs';
import { runWithOptionalPlan, confirmPremiumUsage } from '../../src/runCommand';
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
function baseOptions(force = false): CsvPilotOptions {
    return {
        prompts: [],
        input: [],
        output: '/tmp/out',
        mode: 'record',
        delimiter: ',',
        force,
    };
}

describe('runCommand', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockRun.mockResolvedValue(undefined);
    });

    describe('confirmPremiumUsage', () => {
        it('force が true の場合は入力を求めずに解決する', async () => {
            const reader = jest.fn();
            await expect(confirmPremiumUsage(true, reader)).resolves.toBeUndefined();
            expect(reader).not.toHaveBeenCalled();
        });

        it('force が false で "yes" を入力した場合は解決する', async () => {
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            await expect(confirmPremiumUsage(false, async () => 'yes')).resolves.toBeUndefined();
            writeSpy.mockRestore();
        });

        it('force が false で "y" を入力した場合は解決する', async () => {
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            await expect(confirmPremiumUsage(false, async () => 'y')).resolves.toBeUndefined();
            writeSpy.mockRestore();
        });

        it('force が false で "no" を入力した場合はエラーをスローする', async () => {
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            await expect(confirmPremiumUsage(false, async () => 'no')).rejects.toThrow('Processing cancelled by user.');
            writeSpy.mockRestore();
        });

        it('force が false で空文字を入力した場合はエラーをスローする', async () => {
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            await expect(confirmPremiumUsage(false, async () => '')).rejects.toThrow('Processing cancelled by user.');
            writeSpy.mockRestore();
        });

        it('force が false のとき警告メッセージを stdout に出力する', async () => {
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            await confirmPremiumUsage(false, async () => 'yes').catch(() => { /* ignore */ });
            expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Premium Request'));
            writeSpy.mockRestore();
        });
    });

    describe('runWithOptionalPlan', () => {
        it('planPath が未指定の場合は run(options) を呼ぶ', async () => {
            const options = baseOptions(true);
            await runWithOptionalPlan(options);
            expect(mockRun).toHaveBeenCalledWith(options);
        });

        it('planPath が指定された場合は plan の resolvedOptions で run を呼ぶ', async () => {
            const resolvedOptions = { ...baseOptions(true), output: '/resolved/out' };
            const plan = { planId: 'plan-123', resolvedOptions };
            mockReadFileSync.mockReturnValue(JSON.stringify(plan));
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

            await runWithOptionalPlan(baseOptions(true), '/path/to/plan.json');

            expect(mockReadFileSync).toHaveBeenCalledWith('/path/to/plan.json', 'utf-8');
            expect(mockRun).toHaveBeenCalledWith(resolvedOptions);
            consoleSpy.mockRestore();
        });

        it('planPath が指定された場合は planId をログに出力する', async () => {
            const plan = { planId: 'plan-abc', resolvedOptions: baseOptions(true) };
            mockReadFileSync.mockReturnValue(JSON.stringify(plan));
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

            await runWithOptionalPlan(baseOptions(true), '/path/to/plan.json');

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('plan-abc'));
            consoleSpy.mockRestore();
        });

        it('force が false で "no" を入力した場合は run を呼ばない', async () => {
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const options = baseOptions(false);

            await expect(
                runWithOptionalPlan(options, undefined, async () => 'no')
            ).rejects.toThrow('Processing cancelled by user.');

            expect(mockRun).not.toHaveBeenCalled();
            writeSpy.mockRestore();
        });

        it('force が false でユーザーが yes を選択した場合は run を呼ぶ', async () => {
            const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
            const options = baseOptions(false);

            await runWithOptionalPlan(options, undefined, async () => 'yes');

            expect(mockRun).toHaveBeenCalledWith(options);
            writeSpy.mockRestore();
        });
    });
});
