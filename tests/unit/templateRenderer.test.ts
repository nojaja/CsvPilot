import { renderTemplate, buildTemplateContext, clearTemplateCache } from '../../src/templateRenderer';

describe('templateRenderer', () => {
  beforeEach(() => {
    clearTemplateCache();
  });

  describe('buildTemplateContext', () => {
    it('ヘッダー名でアクセスできるコンテキストを生成する', () => {
      const record = { name: 'Alice', age: '30' };
      const headers = ['name', 'age'];
      const ctx = buildTemplateContext(record, headers, 1);

      expect(ctx['name']).toBe('Alice');
      expect(ctx['age']).toBe('30');
    });

    it('a1, a2 インデックスでアクセスできるコンテキストを生成する', () => {
      const record = { name: 'Alice', age: '30' };
      const headers = ['name', 'age'];
      const ctx = buildTemplateContext(record, headers, 1);

      expect(ctx['a1']).toBe('Alice');
      expect(ctx['a2']).toBe('30');
    });

    it('NR にレコード番号が設定される', () => {
      const record = { id: '1' };
      const headers = ['id'];
      const ctx = buildTemplateContext(record, headers, 5);

      expect(ctx['NR']).toBe(5);
    });

    it('存在しないカラムは空文字になる', () => {
      const record: Record<string, string> = {};
      const headers = ['col'];
      const ctx = buildTemplateContext(record, headers, 1);

      expect(ctx['col']).toBe('');
      expect(ctx['a1']).toBe('');
    });
  });

  describe('renderTemplate', () => {
    it('{{ヘッダー名}} テンプレートを展開する', () => {
      const template = 'Hello {{name}}, you are {{age}} years old.';
      const record = { name: 'Bob', age: '25' };
      const headers = ['name', 'age'];

      const result = renderTemplate(template, record, headers, 1);
      expect(result).toBe('Hello Bob, you are 25 years old.');
    });

    it('{{a1}}, {{a2}} インデックス変数を展開する', () => {
      const template = 'First: {{a1}}, Second: {{a2}}';
      const record = { col1: 'X', col2: 'Y' };
      const headers = ['col1', 'col2'];

      const result = renderTemplate(template, record, headers, 1);
      expect(result).toBe('First: X, Second: Y');
    });

    it('{{NR}} にレコード番号を展開する', () => {
      const template = 'Row {{NR}}: {{value}}';
      const record = { value: 'test' };
      const headers = ['value'];

      const result = renderTemplate(template, record, headers, 3);
      expect(result).toBe('Row 3: test');
    });

    it('テンプレートをキャッシュして2回目も正しく動作する', () => {
      const template = '{{item}}';
      const headers = ['item'];

      const result1 = renderTemplate(template, { item: 'first' }, headers, 1);
      const result2 = renderTemplate(template, { item: 'second' }, headers, 2);

      expect(result1).toBe('first');
      expect(result2).toBe('second');
    });
  });
});
