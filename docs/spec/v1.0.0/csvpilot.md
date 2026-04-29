# CsvPilot v1.0.0 仕様書

## 概要

GitHub Copilot SDK (`@github/copilot-sdk`) を利用し、CSVファイルを1行ずつ処理するCLIアプリ。  
prompt.mdファイルに書かれた作業内容をCopilotセッションに渡し、各CSVレコードへの回答をCSV形式で出力する。

---

## ユースケース / 利用シナリオ

1. 大量CSVレコードに対して同一プロンプトで一括AI処理（感情分析・分類・翻訳など）
2. RBQLによるレコード絞り込み後に特定レコードのみAI処理
3. セッション内で文脈を引き継ぎながら連続処理（全体1sessionモード）
4. 各レコードを独立したAI会話として処理（レコード単位sessionモード）

---

## 機能要件

### 起動引数

| 引数 | 形式 | 必須 | 説明 |
|------|------|------|------|
| 第1引数 (`-p, --prompts`) | glob/ファイル/フォルダ（複数可） | 必須 | `*.prompt.md` ファイルまたはフォルダ |
| 第2引数 (`-i, --input`) | ファイル/フォルダ（複数可） | 必須 | CSVファイルまたはフォルダ |
| 第3引数 (`-q, --query`) | RBQL文字列 | 任意 | CSVへのRBQLフルクエリ（省略時は全行処理） |
| 第4引数 (`-o, --output`) | ディレクトリパス | 必須 | 出力先フォルダ |
| 第5引数 (`-m, --mode`) | `whole` \| `record` | 任意 | セッションモード（デフォルト: `whole`） |

追加オプション:
- `--token <token>`: GitHub認証トークン（省略時は環境変数 `GITHUB_TOKEN` / `GH_TOKEN` / `COPILOT_GITHUB_TOKEN`）
- `--model <model>`: 使用モデル（省略時はSDKデフォルト）
- `--delimiter <char>`: CSV区切り文字（デフォルト: `,`）

### prompt.md ファイルの種類

| パターン | 用途 |
|----------|------|
| `*.session.prompt.md` | セッション開始時のシステムメッセージ（全レコード共通の指示）|
| `*.record.prompt.md` | レコード毎に送信するプロンプト（Handlebarsテンプレート）|

#### `*.record.prompt.md` テンプレート変数

CSV1行目はヘッダー行として扱い、以下の変数でアクセス可能:

```handlebars
{{a1}} {{a2}} ...   ← 列インデックス（1始まり）
{{ヘッダー名}}      ← ヘッダー名で直接参照
{{NR}}              ← レコード番号（1始まり）
```

### RBQL処理

- `rbql` パッケージの `query_table()` を使用
- RBQLが指定された場合: 全CSVレコードをメモリに読み込み後、クエリを適用
- RBQLが省略された場合: ストリーミング処理（メモリ効率最大）
- クエリ例: `SELECT a1, a2 WHERE a3 != "skip"`

### セッションモード

| モード | 動作 |
|--------|------|
| `whole`（デフォルト） | 全(CSV×record.prompt.md)処理を1つのCopilotセッションで行う。全レコードの回答が同一会話履歴として蓄積される |
| `record` | 各CSVレコードごとに独立したCopilotセッションを作成・破棄する |

### 出力ファイル

- 出力先: `<outputDir>/{csv_basename}__{record_prompt_basename}.csv`
- 例: `input.csv` × `analyze.record.prompt.md` → `output/input__analyze.record.prompt.csv`
- フォーマット: 入力CSVの全カラム + `_copilot_response` カラム（Copilotの回答）

---

## 非機能要件

| 項目 | 要件 |
|------|------|
| CSV入力 | `csv-parse` によるストリーミング処理（巨大ファイル対応） |
| CSV出力 | `csv-stringify` によるストリーミング書き込み（巨大ファイル対応） |
| パス正規化 | `@nojaja/pathutil` によるOS差異吸収 |
| フォルダ探索 | `@nojaja/dirwalker` によるサブフォルダ含む再帰探索 |
| ESLint | `sonarjs/cognitive-complexity: ['error', 10]`, `no-unused-vars: ['warn']` |
| 依存関係 | `dependency-cruiser` による循環依存禁止 (`no-circular`) |
| バンドル | `webpack` + `ts-loader` でNode.js向け単一ファイル出力 |
| 認証 | `--token` オプション優先、なければ環境変数 (`GITHUB_TOKEN` 等) |

---

## API / インターフェース定義

### CLI使用例

```bash
# 基本的な使用
npx csvpilot \
  -p prompts/ \
  -c data/customers.csv \
  -o output/

# RBQLフィルタ + レコード単位セッション
npx csvpilot \
  -p prompts/analyze.record.prompt.md \
  -c data/ \
  -q "SELECT * WHERE a3 != 'skip'" \
  -o output/ \
  -m record

# 複数prompts・複数CSV
npx csvpilot \
  -p prompts/task1.record.prompt.md prompts/task2.record.prompt.md \
  -c data/a.csv data/b.csv \
  -o output/
```

### 主要モジュール

```
src/
├── index.ts          # shebang + entry
├── cli.ts            # Commander定義 + 最上位オーケストレーション
├── types.ts          # 共有型定義
├── fileResolver.ts   # パス/フォルダ解決（DirWalker, PathUtil）
├── promptLoader.ts   # prompt.md読み込み・分類
├── templateRenderer.ts # Handlebarsテンプレートレンダリング
├── csvProcessor.ts   # CSVストリーミング + RBQL絞り込み
├── sessionManager.ts # Copilotセッション管理
└── outputWriter.ts   # CSVストリーミング出力
```

---

## 受け入れ条件 (Acceptance Criteria)

1. `*.session.prompt.md` の内容がCopilotセッションのシステムメッセージとして反映される
2. `*.record.prompt.md` テンプレート内で `{{a1}}`, `{{ヘッダー名}}`, `{{NR}}` が正しく展開される
3. RBQLクエリ指定時は該当行のみCopilotに渡される
4. `whole` モードでは全レコード処理が同一セッション内で行われる（会話履歴が蓄積）
5. `record` モードでは各レコードが独立したセッションとして処理される
6. 出力CSVには入力列 + `_copilot_response` 列が含まれる
7. フォルダ指定時はサブフォルダを含む全該当ファイルが処理対象となる
8. 認証トークンは `--token` オプション → 環境変数の順で解決される
9. `npm run build` でWebpackバンドルが成功する
10. `npm test` でユニットテストが全て通過する
11. `npm run lint` でESLintエラーが0件（cognitive-complexity ≤ 10 を含む）
12. `npm run depcruise` で循環依存が0件

---

## テストケース要約

| カテゴリ | テスト内容 |
|----------|-----------|
| fileResolver | ファイル/フォルダ両方の解決、拡張子フィルタ |
| promptLoader | session/record分類、複数ファイル読み込み |
| templateRenderer | a1/a2インデックス変数展開、ヘッダー名変数展開 |
| csvProcessor | ヘッダー解析、ストリーミング行読み込み、RBQLフィルタ |
| outputWriter | CSV行書き込み、_copilot_response列追加 |
| sessionManager | whole/recordモード動作（Copilot SDKモック） |
| E2E | ビルド後バイナリへのCLI実行・出力検証 |

---

## 更新履歴

- v1.0.0: 初版作成 (2026-04-29)
