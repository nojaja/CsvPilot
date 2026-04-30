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
npx csvpilot -p <prompt-dir> -i <csv-file> -o <output-dir>
```

### From source

```bash
git clone https://github.com/TODO/csvpilot.git
cd csvpilot
npm install
npm run build
node dist/csvpilot.bundle.js --help
```

---

## Usage

```
csvpilot [options]

Required:
  -p, --prompts <paths...>   Prompt .md file(s) or folder(s)
  -i, --input  <paths...>    Input CSV file(s) or folder(s)
  -o, --output <dir>         Output directory

Optional:
  -c, --config   <path...>   Config file(s): json/yaml (later files override earlier)
  -q, --query    <query>     RBQL query string for row filtering
  -m, --mode     <mode>      Session mode: whole | folder | file | record  (default: whole)
  --token        <token>     GitHub auth token (overrides GITHUB_TOKEN env var)
  --model        <model>     Model name (uses SDK default when omitted)
  --delimiter    <char>      CSV delimiter character (default: ,)
  -V, --version              Output the version number
  -h, --help                 Display help
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
   csvpilot --token ghp_xxxxxxxxxxxx ...
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
csvpilot -c ./config.yaml
```

Override some values from CLI:

```bash
csvpilot -c ./config.yaml --mode whole --model gpt-5.3-codex
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
csvpilot \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output
```

**Output** (`reviews__sentiment.csv`):

```
id,product,reviewer,score,comment,sentiment,reason
1,Smartphone X,Taro,4,Fast but short battery life,positive,The high rating and positive language indicate overall satisfaction.
```

### Filter rows with RBQL before processing

```bash
csvpilot \
  -p sample/prompt \
  -i sample/csv/reviews.csv \
  -o sample/output \
  -q "select * where a.score >= 4"
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

- **Issues / Bug reports**: [GitHub Issues](https://github.com/TODO/csvpilot/issues)
- **Documentation**: See [`docs/spec/`](docs/spec/) for detailed specifications.

> TODO: Update the GitHub repository URL above.

---

## License

Licensed under the [Apache License 2.0](LICENSE).
