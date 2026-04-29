# CsvPilot

GitHub Copilot SDK を使って CSV ファイルを1行ずつ処理する CLI ツールです。Handlebars ベースのプロンプトテンプレートを使って各レコードを LLM に送信し、Copilot の応答を新しい列として出力 CSV に追記します。

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.x-green.svg)](https://nodejs.org)

---

## 目次

- [機能](#機能)
- [インストール](#インストール)
- [使い方](#使い方)
- [設定](#設定)
- [使用例](#使用例)
- [コントリビューション](#コントリビューション)
- [サポート](#サポート)
- [ライセンス](#ライセンス)

---

## 機能

- **Handlebars テンプレート** — `*.record.prompt.md` でレコードごとのプロンプトを定義し、`*.session.prompt.md` でセッション共通のシステムメッセージを定義
- **RBQL フィルタリング** — LLM に送信する前に SQL ライクなクエリで行を絞り込み可能
- **セッションモード** — `whole` モードはレコード間で会話履歴を保持、`record` モードはレコードごとに独立したセッションを使用
- **ストリーミング I/O** — CSV をストリームとして読み書きするため低メモリで動作
- **シングルファイルバンドル** — webpack でビルド済みのバンドルとして配布。インストール後のコンパイルは不要

---

## インストール

### npm でグローバルインストール

```bash
npm install -g csvpilot
```

### npx で実行（インストール不要）

```bash
npx csvpilot -p <プロンプトディレクトリ> -i <CSVファイル> -o <出力ディレクトリ>
```

### ソースからビルド

```bash
git clone https://github.com/TODO/csvpilot.git
cd csvpilot
npm install
npm run build
node dist/csvpilot.bundle.js --help
```

---

## 使い方

```
csvpilot [options]

必須:
  -p, --prompts <paths...>   プロンプト .md ファイルまたはフォルダ（複数指定可）
  -i, --input  <paths...>    入力 CSV ファイルまたはフォルダ（複数指定可）
  -o, --output <dir>         出力先フォルダ

省略可能:
  -q, --query    <query>     RBQL クエリ文字列（行フィルタリング用）
  -m, --mode     <mode>      セッションモード: whole | record  (デフォルト: whole)
  --token        <token>     GitHub 認証トークン（GITHUB_TOKEN 環境変数より優先）
  --model        <model>     モデル名（省略時は SDK のデフォルトを使用）
  --delimiter    <char>      CSV 区切り文字（デフォルト: ,）
  -V, --version              バージョンを表示
  -h, --help                 ヘルプを表示
```

### 認証

GitHub Copilot CLI（`gh copilot`）で既にサインイン済みの場合、追加のトークン設定は不要です。Copilot SDK が自動的に認証情報を引き継ぎます。

未認証の場合、または別のトークンを使いたい場合は、以下のいずれかの方法で指定してください。

1. 環境変数（推奨）:
   ```bash
   export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
   ```
2. CLI オプション:
   ```bash
   csvpilot --token ghp_xxxxxxxxxxxx ...
   ```

---

## 設定

### プロンプトファイル

プロンプトディレクトリに以下の2種類の Markdown ファイルを配置します。

| ファイルパターン | 役割 |
|---|---|
| `*.record.prompt.md` | レコードごとのプロンプト。Handlebars 変数は CSV の列名と `{{NR}}` (行番号) にマッピングされます。 |
| `*.session.prompt.md` | セッション内の全レコードで共有されるシステムメッセージ。 |

### セッションモード

| モード | 動作 |
|---|---|
| `whole`（デフォルト） | 全レコードを1つの会話セッションで処理（会話履歴を保持）。 |
| `record` | レコードごとに独立したセッションを開始（コンテキスト共有なし）。 |

---

## 使用例

### 製品レビューの感情分析

**ディレクトリ構成:**

```
sample/
  csv/
    reviews.csv
  prompt/
    system.session.prompt.md
    sentiment.record.prompt.md
  output/
```

**`system.session.prompt.md`**

```
あなたは製品レビューの感情分析を行う専門アシスタントです。
感情ラベルは「ポジティブ」「ネガティブ」「中立」のいずれかを選択してください。
回答は簡潔に1〜2文でまとめてください。
```

**`sentiment.record.prompt.md`**

```
レコード番号: {{NR}}
製品名: {{product}}
スコア: {{score}} / 5
コメント: {{comment}}

上記のレビューの感情を分析し、「感情ラベル: <ラベル>。<理由を1文で>」の形式で答えてください。
```

**実行:**

```bash
csvpilot \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output
```

**出力** (`reviews__sentiment.csv`):

```
id,product,reviewer,score,comment,_copilot_response
1,スマートフォンX,田中太郎,4,動作は速いが電池の持ちがやや短い,"感情ラベル: ポジティブ。..."
```

### RBQL で行を絞り込んでから処理

```bash
csvpilot \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output \
  -q "select * where a.score >= 4"
```

---

## コントリビューション

コントリビューションを歓迎します！

1. リポジトリをフォークし、フィーチャーブランチを作成してください。
2. 既存のコードスタイル（TypeScript + ESLint）に従って変更を加えてください。
3. プルリクエストを開く前にテストを実行してください:
   ```bash
   npm test          # ユニットテスト
   npm run test:e2e  # E2E テスト
   ```
4. `main` ブランチへのプルリクエストを、変更内容の説明を添えて開いてください。

大きな変更を行う場合は、先にイシューを開いてアプローチを議論してください。

---

## サポート

- **バグ報告 / 質問**: [GitHub Issues](https://github.com/TODO/csvpilot/issues)
- **詳細仕様**: [`docs/spec/`](docs/spec/) を参照してください。

> TODO: 上記の GitHub リポジトリ URL を正しい URL に更新してください。

---

## ライセンス

[Apache License 2.0](LICENSE) の下でライセンスされています。
