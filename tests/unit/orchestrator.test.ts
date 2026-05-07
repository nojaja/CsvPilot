import { run } from '../../src/orchestrator';
import type { CsvPilotOptions } from '../../src/types';

jest.mock('../../src/fileResolver', () => ({
    resolvePromptFiles: jest.fn(),
    resolveCsvFiles: jest.fn(),
}));

jest.mock('../../src/promptLoader', () => ({
    loadPromptFiles: jest.fn(),
    buildSystemMessage: jest.fn(),
    getRecordPrompts: jest.fn(),
}));

jest.mock('../../src/csvProcessor', () => ({
    loadCsvRecords: jest.fn(),
    loadCsvHeaders: jest.fn(),
}));

jest.mock('../../src/templateRenderer', () => ({
    renderTemplate: jest.fn(),
}));

jest.mock('../../src/outputWriter', () => ({
    buildOutputPath: jest.fn(),
    createOutputWriter: jest.fn(),
    isOutputFilePath: jest.fn(),
}));

jest.mock('../../src/responseParser', () => ({
    parseJsonResponse: jest.fn(),
    extractColumns: jest.fn(),
    getOutputColumnNames: jest.fn(),
}));

jest.mock('../../src/sessionManager', () => ({
    startClient: jest.fn(),
    createCopilotSession: jest.fn(),
    sendPrompt: jest.fn(),
    disconnectSession: jest.fn(),
    stopClient: jest.fn(),
}));

import { resolvePromptFiles, resolveCsvFiles } from '../../src/fileResolver';
import { loadPromptFiles, buildSystemMessage, getRecordPrompts } from '../../src/promptLoader';
import { loadCsvRecords, loadCsvHeaders } from '../../src/csvProcessor';
import { renderTemplate } from '../../src/templateRenderer';
import { buildOutputPath, createOutputWriter, isOutputFilePath } from '../../src/outputWriter';
import { parseJsonResponse, extractColumns, getOutputColumnNames } from '../../src/responseParser';
import { startClient, createCopilotSession, sendPrompt, disconnectSession, stopClient } from '../../src/sessionManager';

const mockResolvePromptFiles = resolvePromptFiles as jest.Mock;
const mockResolveCsvFiles = resolveCsvFiles as jest.Mock;
const mockLoadPromptFiles = loadPromptFiles as jest.Mock;
const mockBuildSystemMessage = buildSystemMessage as jest.Mock;
const mockGetRecordPrompts = getRecordPrompts as jest.Mock;
const mockLoadCsvRecords = loadCsvRecords as jest.Mock;
const mockLoadCsvHeaders = loadCsvHeaders as jest.Mock;
const mockRenderTemplate = renderTemplate as jest.Mock;
const mockBuildOutputPath = buildOutputPath as jest.Mock;
const mockCreateOutputWriter = createOutputWriter as jest.Mock;
const mockIsOutputFilePath = isOutputFilePath as jest.Mock;
const mockParseJsonResponse = parseJsonResponse as jest.Mock;
const mockExtractColumns = extractColumns as jest.Mock;
const mockGetOutputColumnNames = getOutputColumnNames as jest.Mock;
const mockStartClient = startClient as jest.Mock;
const mockCreateCopilotSession = createCopilotSession as jest.Mock;
const mockSendPrompt = sendPrompt as jest.Mock;
const mockDisconnectSession = disconnectSession as jest.Mock;
const mockStopClient = stopClient as jest.Mock;

/**
 * テスト用ベースオプションを生成する
 * @returns CsvPilotOptions
 */
function baseOptions(): CsvPilotOptions {
    return {
        prompts: ['/prompts'],
        input: ['/input'],
        output: '/output',
        mode: 'record',
        delimiter: ',',
    };
}

describe('orchestrator', () => {
    const mockClient = { id: 'mock-client' };
    const mockSession = { id: 'mock-session' };
    const mockWriter = {
        writeRow: jest.fn(),
        close: jest.fn(),
    };

    const recordPrompt = {
        path: '/prompts/sentiment.record.prompt.md',
        basename: 'sentiment',
        content: 'Analyze: {{comment}}',
        outputSchema: {
            columns: [{ name: 'sentiment', path: 'sentiment', required: true }],
        },
    };

    beforeEach(() => {
        jest.clearAllMocks();

        mockResolvePromptFiles.mockResolvedValue(['/prompts/sentiment.record.prompt.md']);
        mockResolveCsvFiles.mockResolvedValue(['/input/data.csv']);
        mockLoadPromptFiles.mockResolvedValue([recordPrompt]);
        mockBuildSystemMessage.mockReturnValue('You are helpful.');
        mockGetRecordPrompts.mockReturnValue([recordPrompt]);
        mockGetOutputColumnNames.mockReturnValue(['sentiment']);
        mockLoadCsvRecords.mockResolvedValue({
            headers: ['id', 'comment'],
            records: [{ id: '1', comment: 'great' }],
        });
        mockLoadCsvHeaders.mockResolvedValue(['id', 'comment']);
        mockRenderTemplate.mockReturnValue('Analyze: great');
        mockBuildOutputPath.mockReturnValue('/output/data__sentiment.csv');
        mockCreateOutputWriter.mockResolvedValue(mockWriter);
        mockIsOutputFilePath.mockReturnValue(false);
        mockWriter.writeRow.mockResolvedValue(undefined);
        mockWriter.close.mockResolvedValue(undefined);
        mockSendPrompt.mockResolvedValue('{"sentiment": "positive"}');
        mockParseJsonResponse.mockReturnValue({ sentiment: 'positive' });
        mockExtractColumns.mockReturnValue({ sentiment: 'positive' });
        mockStartClient.mockResolvedValue(mockClient);
        mockCreateCopilotSession.mockResolvedValue(mockSession);
        mockDisconnectSession.mockResolvedValue(undefined);
        mockStopClient.mockResolvedValue(undefined);
    });

    describe('run', () => {
        it('record モードで全処理が完了する', async () => {
            await run(baseOptions());

            expect(mockStartClient).toHaveBeenCalled();
            expect(mockLoadCsvRecords).toHaveBeenCalledWith('/input/data.csv', ',', undefined);
            expect(mockSendPrompt).toHaveBeenCalled();
            expect(mockWriter.writeRow).toHaveBeenCalled();
            expect(mockWriter.close).toHaveBeenCalled();
            expect(mockStopClient).toHaveBeenCalled();
        });

        it('recordPrompts が空の場合は処理をスキップして警告を出す', async () => {
            mockGetRecordPrompts.mockReturnValue([]);
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

            await run(baseOptions());

            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('record.prompt.md'));
            expect(mockStartClient).not.toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('whole モードで共有セッションを作成して処理する', async () => {
            const options = { ...baseOptions(), mode: 'whole' as const };
            mockCreateCopilotSession.mockResolvedValue(mockSession);

            await run(options);

            expect(mockCreateCopilotSession).toHaveBeenCalled();
            expect(mockDisconnectSession).toHaveBeenCalled();
        });

        it('処理中に例外が発生しても stopClient が呼ばれる', async () => {
            mockLoadCsvRecords.mockRejectedValue(new Error('CSV read error'));

            await expect(run(baseOptions())).rejects.toThrow('CSV read error');
            expect(mockStopClient).toHaveBeenCalled();
        });

        it('出力スキーマがない場合はエラーをスローする', async () => {
            const promptWithoutSchema = { ...recordPrompt, outputSchema: undefined };
            mockGetRecordPrompts.mockReturnValue([promptWithoutSchema]);

            await expect(run(baseOptions())).rejects.toThrow('output.columns');
            expect(mockStopClient).toHaveBeenCalled();
        });

        it('-o がファイルパスの場合 buildOutputPath を呼ばず createOutputWriter を1回だけ呼ぶ', async () => {
            mockIsOutputFilePath.mockReturnValue(true);
            const fileOptions = { ...baseOptions(), output: '/output/result.csv' };

            await run(fileOptions);

            expect(mockBuildOutputPath).not.toHaveBeenCalled();
            expect(mockCreateOutputWriter).toHaveBeenCalledTimes(1);
            expect(mockCreateOutputWriter).toHaveBeenCalledWith(
                '/output/result.csv',
                expect.any(Array),
                expect.any(Array)
            );
        });

        it('-o がファイルパスの場合 close が1回だけ呼ばれる', async () => {
            mockIsOutputFilePath.mockReturnValue(true);
            mockResolveCsvFiles.mockResolvedValue(['/input/a.csv', '/input/b.csv']);
            mockLoadCsvHeaders.mockResolvedValue(['id', 'comment']);
            mockLoadCsvRecords.mockResolvedValue({
                headers: ['id', 'comment'],
                records: [{ id: '1', comment: 'text' }],
            });
            const fileOptions = { ...baseOptions(), output: '/output/result.csv' };

            await run(fileOptions);

            expect(mockWriter.close).toHaveBeenCalledTimes(1);
            expect(mockWriter.writeRow).toHaveBeenCalledTimes(2); // 2 CSV files x 1 record each
        });
    });
});
