# CsvPilot

GitHub Copilot SDK を使って CSV ファイルを1行ずつ処理する CLI ツールです。Handlebars ベースのプロンプトテンプレートを使って各レコードを LLM に送信し、Copilot の JSON 応答から宣言されたフィールドを個別の CSV 列として出力します。

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.x-green.svg)](https://nodejs.org)

---

## 目次

- [機能](#機能)
- [インストール](#インストール)
- [使い方](#使い方)
- [設定](#設定)
- [使用例](#使用例)
- [AI エージェントワークフロー](#ai-エージェントワークフロー)
- [コントリビューション](#コントリビューション)
- [サポート](#サポート)
- [ライセンス](#ライセンス)

---

## 機能

- **Handlebars テンプレート** — `*.record.prompt.md` でレコードごとのプロンプトを定義し、`*.session.prompt.md` でセッション共通のシステムメッセージを定義
- **スキーマ駆動のマルチカラム出力** — `*.record.prompt.md` のフロントマターに出力カラムを宣言。Copilot は JSON で応答し、各フィールドが独立した CSV 列として書き出される
- **RBQL フィルタリング** — LLM に送信する前に SQL ライクなクエリで行を絞り込み可能
- **セッションモード** — `whole` / `folder` / `file` / `record` から選択でき、CSV 量に応じて文脈共有と分離のバランスを調整可能
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
npx csvpilot run -p <プロンプトディレクトリ> -i <CSVファイル> -o <出力ディレクトリ>
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

### サブコマンド（v1.2.0+）

```
csvpilot <command> [options]

Commands:
  run       CSV 処理パイプラインを実行する
  doctor    事前チェック: 環境・トークン・設定パスを検証する
  plan      ドライラン: LLM を呼び出さずに実行計画を生成する
  verify    出力 CSV を検証スペックと照合する
  init      AI エージェント用テンプレートファイルを生成する  (使用法: init agent)
```

コマンド固有のオプションは `csvpilot <command> --help` で確認できます。

#### 共通オプション（`run` / `doctor` / `plan`）

```
  -p, --prompts <paths...>   プロンプト .md ファイルまたはフォルダ（複数指定可）
  -i, --input  <paths...>    入力 CSV ファイルまたはフォルダ（複数指定可）
  -o, --output <dir>         出力先フォルダ
  -c, --config <path...>     設定ファイル（json/yaml、複数指定時は後勝ち）
  -q, --query  <query>       RBQL クエリ文字列（行フィルタリング用）
  -m, --mode   <mode>        セッションモード: whole | folder | file | record  (デフォルト: whole)
  --token      <token>       GitHub 認証トークン（GITHUB_TOKEN 環境変数より優先）
  --model      <model>       モデル名（省略時は SDK のデフォルトを使用）
  --delimiter  <char>        CSV 区切り文字（デフォルト: ,）
  -V, --version              バージョンを表示
  -h, --help                 ヘルプを表示
```

#### コマンド固有オプション

| コマンド | オプション | 説明 |
|---|---|---|
| `doctor`、`plan` | `--format <fmt>` | 出力フォーマット: `text`（デフォルト）または `json` |
| `plan` | `--save-plan <path>` | JSON 計画をファイルに保存する |
| `run` | `--plan <path>` | 保存済み計画 JSON ファイルを読み込む |
| `verify` | `--actual <path>` | 実際の出力 CSV またはディレクトリのパス |
| `verify` | `--spec <path>` | `verify.spec.yaml` のパス |
| `verify` | `--format <fmt>` | 出力フォーマット: `text`（デフォルト）または `json` |
| `init agent` | `--output <dir>` | 出力先ディレクトリ（デフォルト: `.csvpilot`） |
| `init agent` | `--force` | 既存のテンプレートファイルを上書きする |

### 認証

GitHub Copilot CLI（`gh copilot`）で既にサインイン済みの場合、追加のトークン設定は不要です。Copilot SDK が自動的に認証情報を引き継ぎます。

未認証の場合、または別のトークンを使いたい場合は、以下のいずれかの方法で指定してください。

1. 環境変数（推奨）:
   ```bash
   export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
   ```
2. CLI オプション:
   ```bash
  csvpilot run --token ghp_xxxxxxxxxxxx ...
   ```

---

## 設定

### プロンプトファイル

プロンプトディレクトリに以下の2種類の Markdown ファイルを配置します。

| ファイルパターン | 役割 |
|---|---|
| `*.record.prompt.md` | レコードごとのプロンプト。Handlebars 変数は CSV の列名と `{{NR}}` (行番号) にマッピングされます。**`output.columns` フロントマターブロックが必須です。** |
| `*.session.prompt.md` | セッション内の全レコードで共有されるシステムメッセージ。 |

### 出力スキーマ（フロントマター）

`*.record.prompt.md` の先頭に YAML フロントマターで出力列を宣言します。

````markdown
---
output:
  columns:
    - name: sentiment        # 出力 CSV の列名
      path: sentiment        # JSON レスポンスへのドット記法パス
      required: true         # キーが欠落した場合にエラーをスロー
    - name: confidence
      path: meta.confidence
      default: "0.0"         # キー欠落時のフォールバック値（required: true と併用不可）
---
（プロンプト本文…）
````

Copilot は JSON オブジェクトで応答する必要があります（` ```json ``` ` コードブロックで囲んでも可）。  
宣言した各列がレスポンスから抽出され、独立した CSV 列として書き出されます。

> **列名の衝突** — `name` が入力 CSV のヘッダ列名と重複する場合、処理開始前に非ゼロステータスで終了します。

### セッションモード

| モード | 動作 |
|---|---|
| `whole`（デフォルト） | 全レコードを1つの会話セッションで処理（会話履歴を保持）。 |
| `folder` | CSV を親フォルダ単位でまとめ、フォルダごとに1つのセッションを共有。 |
| `file` | CSV ファイルごとに1つのセッションを共有し、同一ファイル内の行で文脈を保持。 |
| `record` | レコードごとに独立したセッションを開始（コンテキスト共有なし）。 |

### 設定ファイル（`--config`）

JSON/YAML に CLI オプションをまとめて記述し、`-c, --config` で読み込めます。
設定ファイルと CLI 引数を同時に指定した場合、CLI 引数が優先されます。

利用可能キー:

- `prompts`, `input`, `query`, `output`, `mode`, `token`, `model`, `delimiter`
- `byok.provider`（Copilot SDK の `provider` 設定）
- `proxy.http`, `proxy.https`, `proxy.noProxy`

例（`config.yaml`）:

```yaml
prompts:
  - sample/prompt
input:
  - sample/csv/reviews.csv
output: sample/output
mode: record
model: gpt-5
delimiter: ","

byok:
  provider:
    type: openai
    baseUrl: https://api.openai.com/v1
    apiKey: ${OPENAI_API_KEY}
    wireApi: responses

proxy:
  http: http://proxy.local:8080
  https: http://proxy.local:8080
  noProxy:
    - localhost
    - 127.0.0.1
```

設定ファイルで実行:

```bash
csvpilot -c ./config.yaml
```

一部を CLI で上書き:

```bash
csvpilot -c ./config.yaml --mode whole --model gpt-5.3-codex
```

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

````markdown
---
output:
  columns:
    - name: sentiment
      path: sentiment
      required: true
    - name: reason
      path: reason
      required: true
---
レコード番号: {{NR}}
製品名: {{product}}
スコア: {{score}} / 5
コメント: {{comment}}

上記のレビューの感情を分析し、以下の JSON 形式で返してください。

```json
{
  "sentiment": "<positive|neutral|negative>",
  "reason": "<理由を1文で>"
}
```
````

**実行:**

```bash
csvpilot \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output
```

**出力** (`reviews__sentiment.csv`):

```
id,product,reviewer,score,comment,sentiment,reason
1,スマートフォンX,田中太郎,4,動作は速いが電池の持ちがやや短い,positive,動作速度への満足感が示されており全体的に肯定的な評価と判断できます。
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

## AI エージェントワークフロー

v1.2.0 では AI エージェントパイプライン内での利用を想定した専用サブコマンドを追加しました。推奨される実行手順は以下のとおりです。

### 1. テンプレートファイルの生成

```bash
csvpilot init agent --output .csvpilot
```

`.csvpilot/agent.config.yaml`、`.csvpilot/verify.spec.yaml`、`.csvpilot/tasks.md` を生成します。  
既存ファイルを上書きする場合は `--force` を付けてください。

### 2. 事前チェック

```bash
csvpilot doctor -c .csvpilot/agent.config.yaml --format json
```

Node.js バージョン・GitHub トークン・プロンプト/入力パスの存在・モデル設定を検証します。

| 終了コード | 意味 |
|---|---|
| `0` | 全チェック合格 |
| `3` | 警告のみ（実行は可能） |
| `1` | 1 件以上の失敗あり |

### 3. 実行計画の作成（ドライラン）

```bash
csvpilot plan -c .csvpilot/agent.config.yaml --format json --save-plan .csvpilot/plan.json
```

LLM を呼び出さずに CSV/プロンプトの組み合わせと出力先を解決します。  
終了コード `0`（成功）、`2`（計画にエラーあり）。

JSON 出力例:

```json
{
  "planId": "plan-20260501T120000",
  "resolvedOptions": { "mode": "record", "model": "gpt-4o" },
  "matrix": [
    {
      "input": "sample/csv/reviews.csv",
      "prompt": "sample/prompt/sentiment.record.prompt.md",
      "output": "sample/output/reviews__sentiment.csv"
    }
  ],
  "warnings": [],
  "errors": []
}
```

### 4. パイプラインの実行

```bash
# 保存した計画から実行:
csvpilot run --plan .csvpilot/plan.json

# 設定ファイルから直接実行:
csvpilot run -c .csvpilot/agent.config.yaml
```

### 5. 出力の検証

```bash
csvpilot verify --actual sample/output --spec .csvpilot/verify.spec.yaml --format json
```

スペックに照らして必須列とレコード数を検証します。

| 終了コード | 意味 |
|---|---|
| `0` | 全チェック合格 |
| `5` | スペック違反あり |

#### `verify.spec.yaml` の例

```yaml
requiredColumns:
  - sentiment
  - reason
rowCount:
  min: 1
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
