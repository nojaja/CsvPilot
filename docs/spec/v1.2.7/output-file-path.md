# v1.2.8 仕様: `-o` オプション ファイルパス指定機能

## 概要
`-o` オプションにフォルダパスだけでなく、具体的な CSV ファイルパスを指定できるようにする。  
ファイルパスを指定した場合、全組み合わせ（CSV × record.prompt.md）の出力をその 1 ファイルに統合する。

## ユースケース

| シナリオ | `-o` の値 | 期待される出力 |
|---------|-----------|--------------|
| フォルダ指定（既存） | `output/` | `output/reviews__sentiment.csv` など自動生成 |
| ファイル指定（新規） | `output/result.csv` | `output/result.csv` に全出力を統合 |
| 複数CSV＋1プロンプト | `merged.csv` | `merged.csv` に全CSVの出力を統合 |

## 機能要件

1. `-o` の値に拡張子（`.csv`, `.tsv` 等）が含まれる場合、**ファイルパス**とみなす。
2. ファイルパスの場合は `buildOutputPath` を使わず、指定パスをそのまま出力先とする。
3. 複数 (CSV × prompt) 組み合わせがある場合:
   - 全 CSV の入力ヘッダをユニオンで取得（順序は登場順）。
   - 全 prompt の追加列をユニオンで取得（順序は登場順）。
   - 1 つの `CsvOutputWriter` を共有し、すべての組み合わせの行を書き込む。
4. フォルダパスの場合（拡張子なし）は従来通りの動作を維持する（後方互換）。

## 非機能要件

- **互換性**: 既存のフォルダ指定は動作変更なし。
- **セキュリティ**: 出力先ディレクトリが存在しない場合は自動作成（既存の `ensureOutputDir` を利用）。

## API / インターフェース定義

### 新規エクスポート

#### `outputWriter.ts`
```typescript
export function isOutputFilePath(output: string): boolean
// path.extname(output) !== '' の場合 true
```

#### `csvProcessor.ts`
```typescript
export async function loadCsvHeaders(filePath: string, delimiter: string): Promise<string[]>
// CSV の1行目（ヘッダ行）のみを読み込んで返す
```

### 変更関数

#### `orchestrator.ts`
- `processOneCombo()`: `sharedWriter?: CsvOutputWriter` パラメータ追加
- `processWholeMode()`, `processRecordMode()`, `processGroupedMode()`, `processAllCombos()`: 同様に追加
- `run()`: ファイルパス時に `createSharedFileWriter()` で共有ライターを作成して注入

#### `planCommand.ts`
- `buildPlannedOutput()`: ファイルパス時は `output` をそのまま使用

#### `cli.ts`
- `-o` オプションの説明文を `'出力先フォルダまたはCSVファイルパス'` に変更

## 受け入れ条件

1. `-o output/result.csv` を指定すると `output/result.csv` に出力される。
2. `-o output/` を指定すると従来通り `output/{csv}__{prompt}.csv` が生成される。
3. 複数 CSV × 1 prompt + ファイル指定で、すべての行が 1 ファイルに書き込まれる。
4. `plan` コマンドでもファイルパス指定の出力先が正しく表示される。

## テストケース要約

- `isOutputFilePath`: 拡張子あり → true、拡張子なし → false
- `loadCsvHeaders`: CSVの1行目だけ返す
- `orchestrator`: ファイルパス指定時に `buildOutputPath` を呼ばず `createOutputWriter` を1回だけ呼ぶ
- `orchestrator`: 複数コンボで `writeRow` が複数回、`close` が1回だけ呼ばれる
- `planCommand`: ファイルパス指定時に出力パスが `-o` の値そのまま

## ロールアウト計画

- パッチリリース v1.2.8
- 後方互換変更のため段階リリース不要
