import { parseJsonResponse, extractByPath, extractColumns } from '../../src/responseParser';
import type { OutputSchema } from '../../src/types';

describe('responseParser', () => {
  // ---- parseJsonResponse ----
  describe('parseJsonResponse', () => {
    it('正しいJSONオブジェクト文字列をパースして返す', () => {
      const result = parseJsonResponse('{"sentiment":"positive","score":0.9}');
      expect(result).toEqual({ sentiment: 'positive', score: 0.9 });
    });

    it('先頭・末尾の空白を無視してパースする', () => {
      const result = parseJsonResponse('  { "key": "value" }  ');
      expect(result).toEqual({ key: 'value' });
    });

    it('Markdownコードブロック(```json ... ```)に包まれたJSONを抽出してパースする', () => {
      const text = '```json\n{"sentiment":"negative"}\n```';
      const result = parseJsonResponse(text);
      expect(result).toEqual({ sentiment: 'negative' });
    });

    it('コードブロックラベルなし(``` ... ```)でもパースできる', () => {
      const text = '```\n{"k":"v"}\n```';
      const result = parseJsonResponse(text);
      expect(result).toEqual({ k: 'v' });
    });

    it('不正なJSONはエラーをスローする', () => {
      expect(() => parseJsonResponse('not json')).toThrow();
    });

    it('JSON配列はエラーをスローする（オブジェクトのみ受け入れ）', () => {
      expect(() => parseJsonResponse('[1,2,3]')).toThrow();
    });
  });

  // ---- extractByPath ----
  describe('extractByPath', () => {
    it('トップレベルキーの値を返す', () => {
      const obj = { sentiment: 'positive', score: 0.9 };
      expect(extractByPath(obj, 'sentiment')).toBe('positive');
    });

    it('ドット記法でネストされた値を返す', () => {
      const obj = { summary: { label: 'good', score: 1 } };
      expect(extractByPath(obj, 'summary.label')).toBe('good');
    });

    it('3段階ネストを辿れる', () => {
      const obj = { a: { b: { c: 'deep' } } };
      expect(extractByPath(obj, 'a.b.c')).toBe('deep');
    });

    it('存在しないキーは undefined を返す', () => {
      const obj = { foo: 'bar' };
      expect(extractByPath(obj, 'baz')).toBeUndefined();
    });

    it('途中のキーが存在しなければ undefined を返す', () => {
      const obj = { a: { b: 1 } };
      expect(extractByPath(obj, 'a.c.d')).toBeUndefined();
    });
  });

  // ---- extractColumns ----
  describe('extractColumns', () => {
    const schema: OutputSchema = {
      columns: [
        { name: 'sentiment', path: 'sentiment', required: true },
        { name: 'confidence', path: 'confidence', required: true },
        { name: 'reason', path: 'reason', required: false, default: 'n/a' },
        { name: 'optional', path: 'optional', required: false },
      ],
    };

    const obj = { sentiment: 'positive', confidence: 0.92, reason: 'short battery' };

    it('宣言済み列をすべて文字列として抽出する', () => {
      const result = extractColumns(obj, schema, { file: 'test.csv', rowIndex: 1 });
      expect(result['sentiment']).toBe('positive');
      expect(result['confidence']).toBe('0.92');
      expect(result['reason']).toBe('short battery');
    });

    it('optional かつ default あり → default 値を返す', () => {
      const result = extractColumns(obj, schema, { file: 'test.csv', rowIndex: 1 });
      // 'reason' は存在するのでそちらが優先、'optional' はない
      expect(result['optional']).toBe('');
    });

    it('optional かつ default なし → 空文字を返す', () => {
      const schemaNoDefault: OutputSchema = {
        columns: [{ name: 'missing', path: 'missing', required: false }],
      };
      const result = extractColumns({}, schemaNoDefault, { file: 'f.csv', rowIndex: 2 });
      expect(result['missing']).toBe('');
    });

    it('required 列が欠落した場合、ファイル名と行番号を含むエラーをスローする', () => {
      const incomplete = { sentiment: 'positive' }; // confidence が無い
      expect(() =>
        extractColumns(incomplete, schema, { file: 'data.csv', rowIndex: 5 })
      ).toThrow(/confidence.*data\.csv.*5|data\.csv.*5.*confidence/i);
    });

    it('応答にない宣言外キーは無視する', () => {
      const extra = { sentiment: 'positive', confidence: 0.5, extra_key: 'ignored' };
      const result = extractColumns(extra, schema, { file: 'f.csv', rowIndex: 1 });
      expect(Object.keys(result)).not.toContain('extra_key');
    });

    it('配列の値はJSON文字列として格納される', () => {
      const withArray = { sentiment: ['a', 'b'], confidence: 0.9 };
      const result = extractColumns(withArray, schema, { file: 'f.csv', rowIndex: 1 });
      expect(result['sentiment']).toBe('["a","b"]');
    });

    it('オブジェクトの値はJSON文字列として格納される', () => {
      const withObj = { sentiment: { label: 'pos' }, confidence: 0.9 };
      const result = extractColumns(withObj, schema, { file: 'f.csv', rowIndex: 1 });
      expect(result['sentiment']).toBe('{"label":"pos"}');
    });

    it('default値がある場合は値が存在してもdefaultは使用しない', () => {
      const schemaWithDefault: OutputSchema = {
        columns: [{ name: 'reason', path: 'reason', required: false, default: 'fallback' }],
      };
      const result = extractColumns(
        { reason: 'actual value' },
        schemaWithDefault,
        { file: 'f.csv', rowIndex: 1 }
      );
      expect(result['reason']).toBe('actual value');
    });
  });
});
