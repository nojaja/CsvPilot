# CsvPilot v1.2.0 要求仕様書（AIエージェント運用向けサブコマンド）

## 概要

v1.2.0 では、AIエージェント（GitHub Copilot 等）が CsvPilot を事前知識なしで安全に操作できることを目的に、
「事前診断」「計画（dry run）」「実行」「結果検証」をサブコマンドとして分離する。

本仕様の主眼は、実処理前に失敗要因を検出し、機械可読な計画を生成し、実行後に期待条件を自動検証できる CLI を定義すること。

---

## Step1 調査メモ（外部事例）

- Terraform `plan`:
  - 変更の適用前に実行計画を提示する二段階運用が定着
  - 自動化向けに詳細な終了コードを提供
- npm `doctor`:
  - 実行前に環境健全性を診断し、原因切り分けを高速化
- docker compose `config -q`:
  - 設定の正規化と検証を実行し、実処理前に妥当性を確認
- helm `lint`:
  - 警告とエラーを分離し、CI で失敗条件を制御可能

設計方針:
- run 前に `doctor` / `plan` を分離提供する
- すべてのサブコマンドに `--format json` を提供し、AIエージェントが解析しやすい出力を保証する
- 終了コードを用途別に明示する

---

## ユースケース / 利用シナリオ

1. AIエージェントが設定未整備状態で着手し、`doctor` で不足（認証、パス、モデル指定）を自己修復する
2. `plan` により対象 CSV・プロンプト・出力列を事前確定し、実行前に衝突や欠落を検出する
3. `run` 実行後に `verify` で件数・必須列・期待値を検証し、成功/失敗を終了コードで判定する
4. 人手なし CI で、同一コマンド列を再現実行して結果の同一性を確認する

---

## 機能要件

### 新規サブコマンド一覧

| サブコマンド | 目的 | 既定出力 |
|---|---|---|
| `csvpilot doctor` | 実行環境と設定の健全性診断 | human readable |
| `csvpilot plan` | dry run（実行計画作成、LLM呼び出しなし） | human readable |
| `csvpilot run` | 実処理（既存処理を移設） | human readable |
| `csvpilot verify` | 実行結果の検証 | human readable |
| `csvpilot init agent` | AI向け設定テンプレート生成 | human readable |

補足:
- ルート直下オプション実行（`csvpilot -p ...`）はサポートしない。

### 1) `csvpilot doctor`

目的:
- 実行前に環境と設定の失敗要因を検出する

入力:
- `--config <path...>`
- `--check <item...>` (`node`, `token`, `paths`, `prompts`, `model`, `proxy`)
- `--format <text|json>`

検証項目:
- Node.js バージョン要件
- トークン解決可能性（`--token` または環境変数）
- 入力/プロンプト/出力パス存在性
- prompt frontmatter と `output.columns` 妥当性
- `byok.provider` 使用時の `model` 必須条件

出力:
- 各項目ごとに `status: pass|warn|fail` と remediation を返す

終了コード:
- `0`: fail なし
- `3`: fail あり
- `1`: 実行時エラー

### 2) `csvpilot plan`（dry run）

目的:
- LLM 呼び出しを行わず、実行対象と失敗リスクを確定する

入力:
- `--config <path...>`
- `-p/--prompts`, `-i/--input`, `-o/--output`, `-m/--mode`, `-q/--query`
- `--format <text|json>`
- `--save-plan <path>`

処理:
- config と CLI 引数をマージ
- 対象 CSV ファイル一覧を解決
- 対象 record prompt 一覧を解決
- `CSV x prompt` の実行マトリクスを生成
- 出力ファイル名と追加列を確定
- ヘッダ衝突、frontmatter 不備、空入力等を検出

出力（JSON時）:
- `resolvedOptions`
- `inputs`（対象CSV）
- `prompts`（対象 prompt と output.columns）
- `matrix`（組み合わせ件数）
- `plannedOutputs`
- `warnings`
- `errors`

終了コード:
- `0`: 計画可能（errors なし）
- `2`: 計画可能だが warning あり
- `3`: 計画不可（errors あり）
- `1`: 実行時エラー

### 3) `csvpilot run`

目的:
- 既存の本処理をサブコマンド化し、`plan` の結果と対応づけて実行する

入力:
- 現行オプションを維持
- 追加: `--plan <path>`（`plan --save-plan` 生成物を入力）

要件:
- `--plan` 指定時は、計画と差分のある直接引数を拒否または警告（仕様選択可能）
- 実行ログに `planId` を含める

終了コード:
- `0`: 全件成功
- `4`: 一部失敗（失敗行あり）
- `1`: 実行時エラー

### 4) `csvpilot verify`

目的:
- 生成 CSV が期待条件を満たすかを機械的に検証する

入力:
- `--actual <file|glob...>`
- `--spec <path>`（検証ルール YAML/JSON）
- `--format <text|json>`

検証ルール例:
- 必須列存在
- 行数一致（最小/最大/完全一致）
- 空値率上限
- 列ごとの列挙値制約
- サンプル行の期待値一致

終了コード:
- `0`: すべて合格
- `5`: 検証失敗
- `1`: 実行時エラー

### 5) `csvpilot init agent`

目的:
- AIエージェントが最短で着手できるテンプレートを生成する

生成物:
- `.csvpilot/agent.config.yaml`（実行パラメータ）
- `.csvpilot/verify.spec.yaml`（検証ルール）
- `.csvpilot/tasks.md`（推奨コマンド手順）

要件:
- 既存ファイル上書き時は `--force` 必須
- 生成後に次の推奨実行を表示:
  1. `csvpilot doctor -c .csvpilot/agent.config.yaml`
  2. `csvpilot plan -c .csvpilot/agent.config.yaml --format json`
  3. `csvpilot run -c .csvpilot/agent.config.yaml`
  4. `csvpilot verify --actual <output> --spec .csvpilot/verify.spec.yaml`

---

## AIエージェント向け設定ファイル要件

### `.csvpilot/agent.config.yaml`

最低限キー:
- `prompts`
- `input`
- `output`
- `mode`
- `model`
- `delimiter`

推奨キー:
- `query`
- `proxy.*`
- `byok.provider.*`

制約:
- 文字列展開（`${ENV_VAR}`）を許可
- 読み込み後の実効設定は `plan` で必ず表示可能であること

### `.csvpilot/verify.spec.yaml`

最低限キー:
- `targets`（検証対象ファイル）
- `rules.requiredColumns`
- `rules.rowCount`

---

## 非機能要件

- 機械可読性:
  - すべての新規サブコマンドは `--format json` を提供
- 再現性:
  - `plan` 出力から `run` / `verify` を再実行可能
- 可観測性:
  - 主要イベントに `command`, `runId`, `planId`, `file`, `row` を付与
- 安全性:
  - `plan` は LLM API を呼ばない
- 性能:
  - `plan` は CSV 本文を全件読み込まない（ヘッダとメタ情報中心）

---

## API / インターフェース定義（CLI）

```bash
csvpilot doctor -c .csvpilot/agent.config.yaml --format json
csvpilot plan -c .csvpilot/agent.config.yaml --format json --save-plan .csvpilot/plan.json
csvpilot run --plan .csvpilot/plan.json
csvpilot verify --actual sample/output/*.csv --spec .csvpilot/verify.spec.yaml --format json
csvpilot init agent --output .csvpilot
```

---

## 互換性・移行計画

互換性影響:
- 新規サブコマンド導入によりヘルプ体系と推奨起動方法が変化
- 既存のルート直下オプションは非対応となる

移行手順:
1. 既存実行を `csvpilot run ...` へ置換
2. CI 前段に `doctor` と `plan` を追加
3. 実行後に `verify` を追加し、品質ゲート化

---

## 受け入れ条件 (Acceptance Criteria)

1. AIエージェントが `init agent` で生成した設定のみを用い、追加説明なしで `doctor -> plan -> run -> verify` を完走できる
2. `plan` 実行時に LLM API 呼び出しが発生しない
3. `plan --format json` 出力に `matrix` と `plannedOutputs` が含まれる
4. `doctor` は fail 項目ごとに remediation を出力する
5. `verify` は失敗時に差分理由（列・件数・ルール名）を返す
6. 各サブコマンドの終了コードが仕様通りである
7. ルート直下オプション（`csvpilot -p ...`）はエラー終了し、`csvpilot run` 利用を案内する

---

## テストケース要約

| カテゴリ | テスト内容 |
|---|---|
| unit/doctor | 各診断項目の pass/warn/fail 判定、終了コード |
| unit/plan | マトリクス生成、衝突検出、JSON 出力スキーマ |
| unit/run | `--plan` 適用時の整合性チェック |
| unit/verify | ルール評価、差分出力、終了コード |
| e2e/agent-flow | `init -> doctor -> plan -> run -> verify` の一連実行 |
| e2e/compat | 旧起動形式の非対応エラーと `run` への移行案内 |

---

## ロールアウト / リリース計画

1. 仕様確定（本書）
2. `doctor` / `plan` / `verify` 実装
3. `init agent` 実装
4. `run` サブコマンド化 + 旧起動形式の削除
5. README / README_ja 更新
6. v1.2.0 リリース

---

## 設計判断 (Design Decisions)

| 判断事項 | 採用方針 | 理由 |
|---|---|---|
| サブコマンド分離 | `doctor` / `plan` / `run` / `verify` を独立コマンドとして実装 | 各フェーズの責務を明確にし、AI エージェントが段階的に操作できるようにするため |
| `plan` は LLM 非呼び出し | `plan` 実行時に LLM API を一切呼ばない | コスト・副作用なしで事前検証できることが機械自動化の前提条件であるため |
| `--format json` 必須 | 全新規サブコマンドに `--format json` を提供 | AI エージェントがパースしやすい構造化出力を保証するため |
| 終了コード明示 | コマンドごとに用途別の終了コードを定義 | CI でのステータス判定を人手なしで行えるようにするため |
| 旧起動形式の廃止 | ルート直下オプション（`csvpilot -p ...`）は非対応 | CLI 入口を `run` に統一し、運用と実装の分岐をなくすため |
| DI コンテナ不使用 | Jest モックで外部依存を差し替え | 軽量な実装を維持しつつテスト可能性を確保するため |
| ラッパー経由 I/O | ファイル I/O・API 呼び出しは必ずラッパー経由 | 単体テストで外部通信をモック化できるようにするため |

---

## 更新履歴

- v1.2.0: AIエージェント運用向けサブコマンド要求を追加 (2026-05-01)
