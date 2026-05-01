import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
    resolveOutputFormat,
    isExistingPath,
    toAbsList,
    printByFormat,
    resolveToken,
} from '../../src/commandCommon';

describe('commandCommon', () => {
    describe('resolveOutputFormat', () => {
        it('"json" を渡すと "json" を返す', () => {
            expect(resolveOutputFormat('json')).toBe('json');
        });

        it('"text" を渡すと "text" を返す', () => {
            expect(resolveOutputFormat('text')).toBe('text');
        });

        it('未知の値を渡すと "text" を返す', () => {
            expect(resolveOutputFormat('unknown')).toBe('text');
        });

        it('undefined を渡すと "text" を返す', () => {
            expect(resolveOutputFormat(undefined)).toBe('text');
        });

        it('null を渡すと "text" を返す', () => {
            expect(resolveOutputFormat(null)).toBe('text');
        });
    });

    describe('isExistingPath', () => {
        let tmpDir: string;

        beforeEach(async () => {
            tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'csvpilot-cc-'));
        });

        afterEach(async () => {
            await fs.promises.rm(tmpDir, { recursive: true, force: true });
        });

        it('存在するパスで true を返す', () => {
            expect(isExistingPath(tmpDir)).toBe(true);
        });

        it('存在しないパスで false を返す', () => {
            expect(isExistingPath(path.join(tmpDir, 'nonexistent'))).toBe(false);
        });
    });

    describe('toAbsList', () => {
        it('相対パスを絶対パスに変換する', () => {
            const result = toAbsList(['src']);
            expect(path.isAbsolute(result[0])).toBe(true);
        });

        it('undefined を渡すと空配列を返す', () => {
            expect(toAbsList(undefined)).toEqual([]);
        });

        it('空配列を渡すと空配列を返す', () => {
            expect(toAbsList([])).toEqual([]);
        });

        it('複数パスをすべて絶対パスに変換する', () => {
            const result = toAbsList(['src', 'tests']);
            expect(result).toHaveLength(2);
            result.forEach(p => expect(path.isAbsolute(p)).toBe(true));
        });
    });

    describe('printByFormat', () => {
        let consoleSpy: jest.SpyInstance;

        beforeEach(() => {
            consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        });

        afterEach(() => {
            consoleSpy.mockRestore();
        });

        it('format が "json" のとき JSON.stringify を出力する', () => {
            const payload = { key: 'value' };
            printByFormat('json', payload, 'text output');
            expect(consoleSpy).toHaveBeenCalledWith(JSON.stringify(payload, null, 2));
        });

        it('format が "text" のとき text を出力する', () => {
            printByFormat('text', {}, 'text output');
            expect(consoleSpy).toHaveBeenCalledWith('text output');
        });
    });

    describe('resolveToken', () => {
        const originalEnv = process.env;

        beforeEach(() => {
            process.env = { ...originalEnv };
        });

        afterEach(() => {
            process.env = originalEnv;
        });

        it('引数のトークンを最優先で返す', () => {
            process.env['GITHUB_TOKEN'] = 'env-token';
            expect(resolveToken('arg-token')).toBe('arg-token');
        });

        it('GITHUB_TOKEN 環境変数を返す', () => {
            delete process.env['GITHUB_TOKEN'];
            delete process.env['GH_TOKEN'];
            delete process.env['COPILOT_GITHUB_TOKEN'];
            process.env['GITHUB_TOKEN'] = 'github-token';
            expect(resolveToken()).toBe('github-token');
        });

        it('GH_TOKEN 環境変数を返す', () => {
            delete process.env['GITHUB_TOKEN'];
            delete process.env['GH_TOKEN'];
            delete process.env['COPILOT_GITHUB_TOKEN'];
            process.env['GH_TOKEN'] = 'gh-token';
            expect(resolveToken()).toBe('gh-token');
        });

        it('COPILOT_GITHUB_TOKEN 環境変数を返す', () => {
            delete process.env['GITHUB_TOKEN'];
            delete process.env['GH_TOKEN'];
            delete process.env['COPILOT_GITHUB_TOKEN'];
            process.env['COPILOT_GITHUB_TOKEN'] = 'copilot-token';
            expect(resolveToken()).toBe('copilot-token');
        });

        it('トークンが一切ない場合は undefined を返す', () => {
            delete process.env['GITHUB_TOKEN'];
            delete process.env['GH_TOKEN'];
            delete process.env['COPILOT_GITHUB_TOKEN'];
            expect(resolveToken()).toBeUndefined();
        });
    });
});
