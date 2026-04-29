# CsvPilot

GitHub Copilot SDK を使って CSV ファイルを1行ずつ処理する CLI アプリケーション。
prompt ファイル（Handlebars テンプレート）を用いて各レコードを LLM に送信し、
Copilot の応答を入力列に付与した CSV として出力します。

## 目次

- **Project Overview**
- **Project Structure**
- **Technology Stack**
- **Features**
- **CLI Usage**
- **Authentication**
- **Sample**
- **Development**
- **Testing**
- **Troubleshooting**
- **License & Author**

## Project Overview

CsvPilot は大量の CSV レコードに対し、定義したテンプレートを使って自動的に LLM（GitHub Copilot SDK）に問い合わせを行い、応答を CSV に追記するためのツールです。
用途例：感情分析、分類、要約、翻訳、品質チェックなど。

## Project Structure

- [src/cli.ts](src/cli.ts) — Commander による CLI エントリ、オプションパース
- [src/orchestrator.ts](src/orchestrator.ts) — 全体のオーケストレーション（CSV×prompt の組み合わせ処理）
- [src/sessionManager.ts](src/sessionManager.ts) — Copilot SDK クライアント / セッション管理
- [src/fileResolver.ts](src/fileResolver.ts) — ファイル / フォルダ解決（再帰探索）
- [src/promptLoader.ts](src/promptLoader.ts) — prompt.md 読み込み・分類
- [src/templateRenderer.ts](src/templateRenderer.ts) — Handlebars テンプレートの展開
- [src/csvProcessor.ts](src/csvProcessor.ts) — CSV のストリーミング読み込み / RBQL 適用
- [src/outputWriter.ts](src/outputWriter.ts) — CSV ストリーミング出力（_copilot_response 列追加）
- [sample/](sample/) — サンプル CSV と prompt（開発用）

## Technology Stack

- Node.js + TypeScript
- GitHub Copilot SDK (`@github/copilot-sdk`)
- Commander (`commander`) — CLI
- Handlebars (`handlebars`) — レコードテンプレート
- csv-parse / csv-stringify — 入出力ストリーミング
- rbql — SQLライクなフィルタリング
- webpack + ts-loader — 単一バンドル生成
- jest / jest-runner-cli — ユニット / E2E テスト
- ESLint / sonarjs, dependency-cruiser — 品質検証

## Features

- Handlebars ベースの `*.record.prompt.md` テンプレートで各レコードを展開
- `*.session.prompt.md` を system message（全レコード共通）として使用
- RBQL による柔軟な行絞り込み（クエリ指定時はメモリ内で評価）
- `whole` / `record` モードによるセッション管理（会話履歴の保持/分離）
- 出力は入力列に `_copilot_response` 列を追加した CSV

## CLI Usage

基本的な実行手順（ビルド後のバンドルを実行）:

```bash
npm install
npm run build
node dist/csvpilot.bundle.js \
	-p sample/prompt \
	-i sample/csv/reviews.csv \
	-o sample/output
```

主要オプション:

- `-p, --prompts <paths...>` — prompt.md ファイルまたはフォルダ（必須）
- `-i, --input <paths...>` — CSV ファイルまたはフォルダ（必須）
- `-q, --query <query>` — RBQL クエリ文字列（任意）
- `-o, --output <dir>` — 出力先フォルダ（必須）
- `-m, --mode <mode>` — `whole` | `record`（デフォルト: `whole`）
- `--token <token>` — GitHub 認証トークン（省略可）
- `--model <model>` — 使用モデル名（SDK デフォルトを使用する場合は省略）
- `--delimiter <char>` — CSV 区切り文字（デフォルト: `,`）

実行例（トークンを直接渡す）:

```bash
node dist/csvpilot.bundle.js -p sample/prompt -i sample/csv/reviews.csv -o sample/output --token gho_xxx
```

出力ファイル命名: `<outputDir>/{csv_basename}__{record_prompt_basename}.csv`。

## Authentication

認証の取り扱いは Copilot SDK のドキュメントに準拠しています。現在の実装は次の通りです:

1. `--token` オプションが指定されている場合、または環境変数にトークンが設定されている場合は **OAuth GitHub App モード** として扱います（`gitHubToken` を SDK に渡し、`useLoggedInUser: false` を設定します）。

2. `--token` も環境変数も未設定の場合は **GitHub サインイン済みユーザー** として扱い、SDK による対話的サインインまたは保存済み CLI 認証情報を利用します。

優先順位（トークン解決）:

- `--token` オプション
- 環境変数 `COPILOT_GITHUB_TOKEN`
- 環境変数 `GH_TOKEN`
- 環境変数 `GITHUB_TOKEN`

（詳細）公式ドキュメント: https://github.com/github/copilot-sdk/blob/main/docs/auth/index.md

## Sample

サンプルフォルダを同梱しています:

- `sample/csv/reviews.csv` — テスト用レビュー CSV
- `sample/prompt/system.session.prompt.md` — セッション共通の system メッセージ
- `sample/prompt/sentiment.record.prompt.md` — レコード毎テンプレート

実行例（サンプル）:

```bash
npm run build
node dist/csvpilot.bundle.js -p sample/prompt -i sample/csv/reviews.csv -o sample/output
```

出力例: `sample/output/reviews__sentiment.record.prompt.csv` のようなファイルが生成されます。

## Development

セットアップ:

```bash
git clone <repo>
npm install
```

主要な開発スクリプト:

- `npm run build` — webpack でバンドル生成
- `npm test` — 単体テスト
- `npm run test:e2e` — E2E（jest-runner-cli）
- `npm run lint` — ESLint
- `npm run depcruise` — 依存関係解析（循環検出）
- `npm run type-check` — TypeScript 型チェック（`tsc --noEmit`）

## Testing

このリポジトリにはユニットテストと E2E テストが含まれます。ワークスペースで実行した結果（ローカル確認）:

- ユニットテスト: 32 tests (5 suites) — パス
- E2E テスト: 5 tests — パス

## Troubleshooting

- PowerShell の表示で日本語が文字化けする場合は、コンソールの文字コードやフォント設定を確認してください。
- `--token` または環境変数が未設定のときは、対話的に GitHub にサインインする必要があります。ヘッドレス / CI での自動実行には環境変数でのトークン指定を推奨します。
- Webpack ビルド時に Handlebars の `require.extensions` に関する警告が出ますが、現状はビルド警告でありバンドル自体は生成されます。

## License & Author

License: Apache License 2.0

Author: (package.json に未設定)

---

生成日: 2026-04-29
