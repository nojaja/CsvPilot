# CsvPilot v1.1.0 仕様書

## 概要

v1.1.0 では、Copilot の回答を単一の `_copilot_response` 列へそのまま書き込む方式を見直し、`*.record.prompt.md` 側で宣言した出力スキーマに従って複数列へ展開して出力できるようにする。

本仕様では、出力列名と列数を処理開始前に確定できるようにすることで、巨大 CSV を対象としても出力データをメモリ保持せず、1 行ずつストリーミングで CSV を生成できるようにする。

---

## ユースケース / 利用シナリオ

1. 感情分析結果を `sentiment`, `confidence`, `reason` の 3 列へ分けて出力する
2. 抽出結果を `category`, `priority`, `assignee` のような業務列へ直接マッピングして後続処理へ渡す
3. 数十万行以上の CSV を対象に、出力行を都度書き出しながら長時間バッチ処理する
4. プロンプトごとに異なる出力列セットを定義し、同一入力 CSV から用途別の出力 CSV を生成する

---

## 機能要件

### 基本方針

- 出力列は実行開始前に確定する
- 出力列定義は `*.record.prompt.md` のメタデータで宣言する
- Copilot の応答は、宣言済みスキーマに一致する JSON オブジェクトとして扱う
- 出力 CSV は入力行の処理完了ごとに 1 行ずつ書き出す
- 入力 CSV と出力 CSV の行順は一致しなければならない

### prompt.md ファイル仕様

`*.record.prompt.md` は Markdown 本文の先頭に YAML frontmatter を持てるものとする。

```yaml
---
output:
  columns:
    - name: sentiment
      path: sentiment
      required: true
    - name: confidence
      path: confidence
      required: false
      default: ""
    - name: reason
      path: reason
      required: true
---
```

#### `output.columns[*]` 定義

| 項目 | 必須 | 説明 |
|------|------|------|
| `name` | 必須 | 出力 CSV に追加する列名 |
| `path` | 必須 | Copilot 応答 JSON から値を取得するパス。`.` 区切りでネスト参照可能 |
| `required` | 任意 | `true` の場合、値が見つからなければエラー |
| `default` | 任意 | 値が見つからない場合の既定値。`required: true` と同時指定は不可 |

#### パス解決ルール

- `path` は JSON オブジェクトに対するドット記法とする
- 例: `summary.label`, `metrics.score`
- 取得した値が文字列・数値・真偽値・null の場合は文字列化して CSV セルへ格納する
- 取得した値が配列またはオブジェクトの場合は JSON 文字列として 1 セルへ格納する

### Copilot 応答仕様

- `*.record.prompt.md` の本文は、宣言済みスキーマに一致する JSON オブジェクトのみを返すよう Copilot へ指示しなければならない
- 実装では、ユーザー記述のプロンプト本文に加えて、出力スキーマを満たす JSON 応答のみを返すよう補助指示を末尾へ付与してよい
- 応答は 1 行ごとに JSON としてパースする
- JSON パースに失敗した場合、その時点で処理を中断しエラー終了する

### 出力ヘッダ確定

- 出力ヘッダは `入力 CSV のヘッダ + output.columns[*].name` で構成する
- 出力ヘッダは対象 `*.record.prompt.md` を読み込んだ時点で確定し、行処理開始後に変更してはならない
- 同一 `*.record.prompt.md` 内で `name` が重複してはならない
- 入力 CSV ヘッダと `output.columns[*].name` が衝突する場合はエラーとする

### 行処理フロー

1. 対象 `*.record.prompt.md` を読み込み、frontmatter から出力スキーマを取得する
2. 出力スキーマの妥当性を検証し、出力 CSV のヘッダを確定する
3. 入力 CSV を先頭から 1 行ずつ読み込む
4. 各行に対してテンプレートをレンダリングし、Copilot へ送信する
5. 応答 JSON をパースし、宣言済み `path` に従って値を抽出する
6. 入力列 + 抽出済み出力列を 1 行として直ちに CSV へ書き込む
7. 最終行まで処理したらストリームを閉じる

### エラーハンドリング

- `output.columns` が空、または未指定の場合はエラーとする
- `name` 重複、`path` 重複自体は許可するが、`name` 重複は不可とする
- `required: true` の列が応答 JSON に存在しない場合はエラーとする
- `required: false` かつ `default` 未指定の列は空文字を出力する
- 応答 JSON に宣言外のキーが含まれていても無視する
- エラー発生時は、どの入力ファイル・何行目・どの出力列で失敗したかをメッセージに含める

### CLI / 設定ファイルへの影響

- 既存 CLI オプションの追加は行わない
- `--prompts`, `--input`, `--output`, `--mode`, `--query`, `--delimiter` のインターフェースは維持する
- v1.1.0 の新形式では、`*.record.prompt.md` に `output.columns` の宣言を必須とする

### 既存 `_copilot_response` 列の扱い

- v1.1.0 では固定 `_copilot_response` 列ではなく、宣言済みの出力列を使用する
- 旧形式の `*.record.prompt.md` は v1.1.0 形式への更新対象とする

---

## 非機能要件

| 項目 | 要件 |
|------|------|
| メモリ使用量 | 出力行を配列やオブジェクト配列として保持しない |
| 出力 | `csv-stringify` によるストリーミング書き込みを継続する |
| 行順 | 入力 CSV の行順を保持する |
| スキーマ確定 | Copilot 応答内容に依存せず、処理開始前にヘッダを確定する |
| 応答解析 | 1 行ごとに JSON パースして破棄し、過去行の応答を保持しない |
| 巨大 CSV 対応 | `query` 未指定時は入力を逐次読み込みし、全行をメモリ展開しない |
| 障害検知 | JSON 不正、必須列欠落、ヘッダ衝突を即時検知して fail-fast とする |

### スコープ外

- RBQL 指定時の完全ストリーミング化は本仕様の主対象外とする
- Copilot の structured output API や function calling の導入は本仕様では必須としない
- 宣言外キーの自動列追加は行わない

---

## API / インターフェース定義

### `*.record.prompt.md` 例

```md
---
output:
  columns:
    - name: sentiment
      path: sentiment
      required: true
    - name: confidence
      path: confidence
      required: true
    - name: reason
      path: reason
      required: true
---

次のレビューを分析してください。
必ず JSON オブジェクトだけを返してください。

レビューID: {{id}}
商品名: {{product}}
レビュー本文: {{comment}}
```

### 想定する Copilot 応答例

```json
{
  "sentiment": "positive",
  "confidence": 0.92,
  "reason": "配送は遅いが製品評価は高いため。"
}
```

### 出力 CSV 例

```csv
id,product,comment,sentiment,confidence,reason
1,Smartphone X,Fast but short battery life,positive,0.92,配送は遅いが製品評価は高いため。
```

### 内部インターフェースの変更点

- `PromptFile` に record prompt の出力スキーマ情報を保持する
- `promptLoader` は frontmatter をパースして Markdown 本文と分離する
- `outputWriter` は固定列ではなく、確定済みの追加列配列を受け取る
- `orchestrator` は JSON 応答を構造化データへ変換してから `outputWriter` へ渡す

---

## 互換性・移行計画

### 互換性

- v1.1.0 では出力列の決定方法が変わるため、既存の `_copilot_response` 前提の後続処理には影響がある
- 既存の record prompt は frontmatter を追加し、Copilot 応答を自由文から JSON オブジェクトへ変更する必要がある

### 移行手順

1. 既存 `*.record.prompt.md` の先頭へ `output.columns` を追加する
2. プロンプト本文を、自由文ではなく JSON オブジェクトを返す指示へ書き換える
3. 旧 `_copilot_response` を参照している後続処理を、新しい列名参照へ置き換える
4. テストデータを更新し、複数列出力を前提にテストを再作成する

---

## 受け入れ条件 (Acceptance Criteria)

1. `*.record.prompt.md` に宣言した `output.columns` から、処理開始前に出力 CSV のヘッダが確定する
2. 出力 CSV には `_copilot_response` 列が含まれず、宣言済み列だけが追加される
3. Copilot が返した JSON オブジェクトから `path` に基づいて複数列へ値が展開される
4. `required: true` の列が欠落した場合、対象行番号付きでエラー終了する
5. `required: false` の列が欠落した場合、`default` または空文字が出力される
6. 入力 CSV が大きい場合でも、`query` 未指定時は出力行をメモリに蓄積せず逐次書き込みされる
7. 入力 CSV の行順と出力 CSV の行順が一致する
8. 入力ヘッダと出力列名が衝突した場合、処理開始前にエラー終了する
9. 応答が JSON でない場合、対象ファイル名と行番号を含むエラーで停止する
10. 1 つの入力 CSV に対して、異なる record prompt ごとに異なる追加列セットの出力 CSV を生成できる

---

## テストケースの要約

| カテゴリ | テスト内容 |
|----------|-----------|
| promptLoader | frontmatter の有無、`output.columns` 読み込み、本文分離、列定義バリデーション |
| outputWriter | 固定 `_copilot_response` を使わず、任意の追加列でヘッダと行を書き込めること |
| responseParser | JSON パース、dot path 展開、配列/オブジェクトの JSON 文字列化 |
| orchestrator | 行ごとに応答を解析し、そのまま 1 行ずつ出力すること |
| validation | 必須列欠落、ヘッダ衝突、無効 frontmatter、JSON 不正時の失敗 |
| E2E | サンプル prompt に基づき複数列出力の CSV が生成されること |

---

## ロールアウト / リリース計画

1. 仕様書を確定する
2. frontmatter 解析と出力スキーマ型を追加する
3. `_copilot_response` 前提の出力処理をスキーマ駆動へ置き換える
4. `query` 未指定経路を完全な逐次処理へ寄せる
5. サンプル prompt / README / テストを更新する
6. v1.1.0 としてリリースし、移行手順を README に記載する

---

## 更新履歴

- v1.1.0: 複数出力カラム対応の仕様追加 (2026-05-01)
