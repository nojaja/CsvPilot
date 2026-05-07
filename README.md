# CsvPilot

A CLI tool that processes CSV files row-by-row using the GitHub Copilot SDK. It sends each record to an LLM via Handlebars-based prompt templates and appends the Copilot response as a new column in the output CSV.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.x-green.svg)](https://nodejs.org)

---

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Examples](#examples)
- [AI Agent Workflow](#ai-agent-workflow)
- [Contributing](#contributing)
- [Support](#support)
- [License](#license)

---

## Features

- **Handlebars templates** — Define per-record prompts with `*.record.prompt.md` and a shared system message with `*.session.prompt.md`
- **Schema-driven multi-column output** — Declare output columns in `*.record.prompt.md` frontmatter; Copilot must respond in JSON and each field is mapped to its own CSV column
- **RBQL filtering** — Apply SQL-like row filtering before sending records to the LLM
- **Session modes** — choose `whole`, `folder`, `file`, or `record` to balance context retention and isolation based on CSV volume
- **Streaming I/O** — Reads and writes CSV as a stream for low memory usage
- **Single-file bundle** — Distributed as a pre-built webpack bundle; no compilation required after install

---

## Installation

### Global install via npm

```bash
npm install -g csvpilot
```

### Run without installing (npx)

```bash
npx csvpilot run -p <prompt-dir> -i <csv-file> -o <output-dir>
```

### From source

```bash
git clone https://github.com/nojaja/csvpilot.git
cd csvpilot
npm install
npm run build
node dist/csvpilot.bundle.js --help
```

---

## Usage

### Subcommands (v1.2.0+)

```
csvpilot <command> [options]

Commands:
  run       Run the CSV processing pipeline
  doctor    Pre-flight checks: verify environment, token, and config paths
  plan      Dry-run: build the execution plan without calling the LLM
  verify    Validate output CSV against a verify spec file
  init      Scaffold AI agent template files  (usage: init agent)
```

Run `csvpilot <command> --help` for command-specific options.

#### Common options (`run` / `doctor` / `plan`)

```
  -p, --prompts <paths...>   Prompt .md file(s) or folder(s)
  -i, --input  <paths...>    Input CSV file(s) or folder(s)
  -o, --output <dir>         Output directory or CSV file path (treated as file when an extension is present)
  -c, --config <path...>     Config file(s): json/yaml (later files override earlier)
  -q, --query  <query>       RBQL query string for row filtering
  -m, --mode   <mode>        Session mode: whole | folder | file | record  (default: whole)
  --token      <token>       GitHub auth token (overrides GITHUB_TOKEN env var)
  --model      <model>       Model name (uses SDK default when omitted)
  --delimiter  <char>        CSV delimiter character (default: ,)
  -V, --version              Output the version number
  -h, --help                 Display help
```

#### Command-specific options

| Command | Option | Description |
|---|---|---|
| `doctor`, `plan` | `--format <fmt>` | Output format: `text` (default) or `json` |
| `plan` | `--save-plan <path>` | Save the JSON plan to a file |
| `run` | `--plan <path>` | Load a saved plan JSON file |
| `run` | `--force` | Skip the premium request consumption confirmation prompt |
| `verify` | `--actual <path>` | Path to the actual output CSV or directory |
| `verify` | `--spec <path>` | Path to `verify.spec.yaml` |
| `verify` | `--format <fmt>` | Output format: `text` (default) or `json` |
| `init agent` | `--output <dir>` | Target directory (default: `.csvpilot`) |
| `init agent` | `--force` | Overwrite existing template files |

### Premium request consumption confirmation

The `run` command displays a warning about premium request consumption before execution and prompts for `yes` / `y` confirmation:

```
[CsvPilot] ⚠️  Premium Request Consumption Notice
  - Regardless of session mode, premium requests are consumed based on the number of records processed.
  - Model multipliers are applied per mode
    (e.g., Claude Opus 4.6 = ×3, Claude Sonnet 4.6 = ×1, GPT-4o = free)
Continue? [yes/no]:
```

For non-interactive environments such as AI agents or CI, pass `--force` to skip the prompt:

```bash
csvpilot run --force -p sample/prompt -i sample/csv/reviews.csv -o sample/output
```

### Authentication

If you are already signed in via GitHub Copilot CLI (`gh copilot`), no additional token configuration is required. The Copilot SDK will automatically pick up your credentials.

If you are not authenticated, or want to use a specific token, provide it via one of the following:

1. Environment variable (recommended):
```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxx
```

2. CLI option:
```bash
csvpilot run --token ghp_xxxxxxxxxxxx ...
```

---

## Configuration

### Prompt files

Place two types of Markdown files in your prompt directory:

| File pattern | Role |
|---|---|
| `*.record.prompt.md` | Per-record prompt. Handlebars variables map to CSV column names plus `{{NR}}` (row number). **Must include** an `output.columns` frontmatter block. |
| `*.session.prompt.md` | System message shared across all records in a session. |

### Output schema (frontmatter)

Each `*.record.prompt.md` **must** declare the output columns in a YAML frontmatter block:

```markdown
---
output:
  columns:
    - name: sentiment        # column name written to the output CSV
      path: sentiment        # dot-notation path into the JSON response
      required: true         # throw if this key is absent from the response
    - name: confidence
      path: meta.confidence
      default: "0.0"         # fallback value when key is absent (cannot combine with required: true)
---
(prompt body here…)
```

Copilot must respond with a JSON object (optionally wrapped in a ` ```json ``` ` code block).  
Each declared column is extracted from the response and written as its own CSV column.

> **Column name collision** — if any `name` duplicates an input CSV header, CsvPilot exits with a non-zero status before processing begins.

### Session modes

| Mode | Behaviour |
|---|---|
| `whole` (default) | All records share a single conversation session (history is preserved). |
| `folder` | CSV files are grouped by parent folder, and each folder uses one shared session. |
| `file` | Each CSV file uses one shared session across all its rows. |
| `record` | Each record starts a fresh session (no shared context). |

### Config file (`--config`)

You can define CLI options in JSON/YAML and load them via `-c, --config`.
If both config and CLI args are provided, CLI args take precedence.

Supported keys:

- `prompts`, `input`, `query`, `output`, `mode`, `token`, `model`, `delimiter`
- `byok.provider` (Copilot SDK `provider` settings)
- `proxy.http`, `proxy.https`, `proxy.noProxy`

Example (`config.yaml`):

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

Run with config:

```bash
csvpilot run -c ./config.yaml
```

Override some values from CLI:

```bash
csvpilot run -c ./config.yaml --mode whole --model gpt-5.3-codex
```

---

## Examples

### Sentiment analysis on product reviews

**Directory layout:**

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
You are a sentiment analysis assistant for product reviews.
Choose one label: Positive / Negative / Neutral.
Keep answers concise (1-2 sentences).
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
Record: {{NR}}
Product: {{product}}
Score: {{score}} / 5
Comment: {{comment}}

Analyse the sentiment and return JSON:

```json
{
  "sentiment": "<positive|neutral|negative>",
  "reason": "<one-sentence reason>"
}
```
````

**Run:**

```bash
csvpilot run \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output
```

**Output** (`sample/output/reviews__sentiment.csv`):

```
id,product,reviewer,score,comment,sentiment,reason
1,Smartphone X,Taro,4,Fast but short battery life,positive,The high rating and positive language indicate overall satisfaction.
```

### Specify a CSV file path as output destination

Passing an extension-bearing path to `-o` merges all output into that single file:

```bash
# Directory (existing behaviour) → generates sample/output/reviews__sentiment.csv automatically
csvpilot run \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output

# File path (new) → writes directly to sample/output/result.csv
csvpilot run \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output/result.csv
```

When multiple CSV files or prompts are involved, all rows are written to the single file using the union of all input headers and additional columns.

### Filter rows with RBQL before processing

```bash
csvpilot run \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output \
  -q "select * where a.score >= 4"
```

---

## AI Agent Workflow

v1.2.0 adds dedicated subcommands designed for use inside AI agent pipelines. The recommended five-step sequence is:

### 1. Scaffold template files

```bash
csvpilot init agent --output .csvpilot
```

Creates `.csvpilot/agent.config.yaml`, `.csvpilot/verify.spec.yaml`, and `.csvpilot/tasks.md`.  
Pass `--force` to overwrite existing files.

### 2. Pre-flight check

```bash
csvpilot doctor -c .csvpilot/agent.config.yaml --format json
```

Checks Node.js version, GitHub token, prompt/input path existence, and model configuration.

| Exit code | Meaning |
|---|---|
| `0` | All checks passed |
| `3` | Warnings only (run can proceed) |
| `1` | At least one failure |

### 3. Build the execution plan (dry-run)

```bash
csvpilot plan -c .csvpilot/agent.config.yaml --format json --save-plan .csvpilot/plan.json
```

Resolves all CSV/prompt file combinations and planned output paths **without** calling the LLM.  
Exit code `0` on success, `2` if errors are found in the plan.

Sample JSON output:

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

### 4. Run the pipeline

```bash
# Load the saved plan:
csvpilot run --plan .csvpilot/plan.json

# Or run directly from a config file:
csvpilot run -c .csvpilot/agent.config.yaml
```

### 5. Verify the output

```bash
csvpilot verify --actual sample/output --spec .csvpilot/verify.spec.yaml --format json
```

Checks required columns and row count against the spec.

| Exit code | Meaning |
|---|---|
| `0` | All checks passed |
| `5` | Spec violation |

#### `verify.spec.yaml` example

```yaml
requiredColumns:
  - sentiment
  - reason
rowCount:
  min: 1
```

---

## Contributing

Contributions are welcome!

1. Fork the repository and create a feature branch.
2. Make your changes following the existing code style (TypeScript + ESLint).
3. Run tests before opening a pull request:
   ```bash
   npm test          # unit tests
   npm run test:e2e  # end-to-end tests
   ```
4. Open a pull request against the `main` branch with a clear description.

For significant changes, please open an issue first to discuss the approach.

---

## Support

- **Issues / Bug reports**: [GitHub Issues](https://github.com/nojaja/csvpilot/issues)
- **Documentation**: See [`docs/spec/`](docs/spec/) for detailed specifications.

---

## License

Licensed under the [Apache License 2.0](LICENSE).
