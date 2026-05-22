![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Python](https://img.shields.io/badge/Python-3.10%2B-blue)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-green)
![React](https://img.shields.io/badge/React-Frontend-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue)
![Ollama](https://img.shields.io/badge/Ollama-Local%20LLM-black)
![SQLite](https://img.shields.io/badge/Database-SQLite-lightgrey)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

# SLM Benchmark Studio

A local-first benchmarking platform for small language models served by [Ollama](https://ollama.com/). It implements the iterative loop:

> **Data → Models → Judge → Insights → Refinement → Data**

Upload a JSONL benchmark dataset (or import a standard public benchmark like **MMLU** or **HellaSwag**), select one or more locally installed Ollama models, run the same prompt template across all of them, score outputs with an LLM judge **and/or** a deterministic scorer, visualize quality and latency, then iterate on the prompt/template.

## Stack

| Layer    | Tech                                                         |
| -------- | ------------------------------------------------------------ |
| Frontend | React + Vite + TypeScript + Tailwind CSS + Recharts + TanStack Table + React Router |
| Backend  | FastAPI + SQLModel + SQLite + Pydantic + httpx + pandas      |
| Models   | Local Ollama at `http://localhost:11434` (`/api/tags`, `/api/chat`) |

## Folder layout

```
slm-benchmark-studio/
├── backend/                FastAPI app + SQLite DB
├── frontend/               React + Vite app
├── data/
│   ├── sample_dataset.jsonl
│   └── exports/            CSV exports written here
├── docker-compose.yml      Optional: run Ollama (and backend) in containers
└── README.md
```

## Prerequisites

- Python 3.10+
- Node.js 18+ (for the frontend)
- Ollama installed and reachable at `http://localhost:11434`

### 1. Install and start Ollama

Follow the official instructions at [ollama.com/download](https://ollama.com/download). Then start the server (if it is not already running):

```bash
ollama serve
```

Pull at least one generator model and (ideally) a separate judge model:

```bash
ollama pull llama3.2:3b
ollama pull qwen2.5:3b
ollama pull gemma2:2b
ollama pull llama3.1:8b   # used as judge
```

> Tip: avoid using the same model as both generator and judge — self-judging can inflate scores.

### 2. Run the backend

```bash
cd backend
python -m venv venv
source venv/bin/activate           # on Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env               # optional, customize if needed
uvicorn app.main:app --reload --port 8000
```

The API will be live at `http://localhost:8000` and OpenAPI docs at `http://localhost:8000/docs`.

### 3. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The UI is now at `http://localhost:5173`. The Vite dev server proxies `/api` and `/health` to the FastAPI backend on port 8000, so no extra configuration is required.

## Trying it out

1. **Get a dataset.** Either upload your own JSONL via **Datasets → Upload JSONL** (e.g. `data/sample_dataset.jsonl`), or use the **Import a standard benchmark** card on the same page to pull MMLU or HellaSwag straight from HuggingFace.
2. **Inspect local models.** Visit **Models** to confirm Ollama is reachable.
3. **Create a prompt template.** Use **Prompts** to keep or customize a template. The default `{{input}}` template works for free-form datasets; pick the seeded **MCQ benchmark (MMLU / HellaSwag)** template when the dataset comes from a multiple-choice benchmark — it tells the model to emit a single letter. Variables `{{input}}`, `{{reference}}`, `{{category}}`, and `{{difficulty}}` are available.
4. **Configure a run.** On **Runs**, pick a dataset, a prompt, one or more generator models, and a judge model (optional). Hit **Create & start run**.
5. **Watch the dashboard.** The run page polls for progress. Once it completes you will see per-model averages, latency, benchmark accuracy (if applicable), and the full results table.
6. **Explore insights.** Visit **Insights** for cross-run charts (radar, scatter, ranking) including a benchmark-accuracy column.
7. **Refine.** **Refinement** surfaces the lowest-scoring examples and lets you fork a new improved prompt template.

## Scoring criteria

A run can be scored by two independent mechanisms — use either or both:

- **LLM judge** (subjective rubric, 1–5). Configure a judge model on the run form. Best for open-ended generations where there is no single "right" answer.
- **Deterministic / traditional benchmark scoring**. Activated automatically whenever a dataset example carries a `task_type` in its metadata (which is the case for any benchmark imported via the catalog). Today this covers:
  - **Multiple choice** (MMLU, HellaSwag): the model is asked to emit a letter; the runner parses A/B/C/D from the response and compares to the gold letter. Per-model **accuracy** appears alongside the judge rubric.

> **About log-likelihoods.** Canonical leaderboard numbers for MMLU/HellaSwag come from scoring the loglikelihood of each candidate completion under the model. Ollama's chat API does not expose token logprobs, so this platform runs benchmarks in **generation mode** — the model has to follow the "answer with a single letter" instruction. Numbers therefore correlate with leaderboard scores but should not be expected to match them exactly, especially for tiny base models that struggle to follow the format.

## Importing public benchmarks

The **Datasets** page exposes a catalog of supported public benchmarks. Each import fetches a configurable subset/split from the HuggingFace `datasets-server` REST API and writes it into a regular dataset, so the rest of the app (runs, refinement, exports) treats it like any other.

Currently supported:

| Benchmark | Source | Subsets / split | Notes |
| --- | --- | --- | --- |
| **MMLU** | [`cais/mmlu`](https://huggingface.co/datasets/cais/mmlu) | 57 subjects + `all`; defaults to `test` | 4-way multiple choice across academic subjects |
| **HellaSwag** | [`Rowan/hellaswag`](https://huggingface.co/datasets/Rowan/hellaswag) | `default` config; defaults to `validation` | Commonsense ending-completion; the `test` split has hidden labels and cannot be scored locally |

The import card lets you pick a subset, a split, a number of examples (with sensible defaults), and whether to shuffle. Each imported example carries `metadata.task_type = "mcq"` + `metadata.answer_letter`, which is what triggers the deterministic scorer at run time.

## JSONL dataset format

Each line should be a JSON object. Only `input` is required.

```jsonl
{"id":"ex1","input":"Summarize: ...","reference":"...","category":"summarization","difficulty":"easy"}
{"id":"ex2","input":"Classify ...","reference":"mixed","category":"classification","difficulty":"medium"}
```

Recognized keys:

| Key                     | Required | Notes                                            |
| ----------------------- | -------- | ------------------------------------------------ |
| `input` / `prompt`      | yes      | The input text passed to the model               |
| `reference` / `expected`| no       | Ground-truth answer used by the judge            |
| `category`              | no       | Free-form category label                         |
| `difficulty`            | no       | Free-form difficulty label                       |
| `id` / `external_id`    | no       | Stable identifier preserved for traceability     |
| `metadata`              | no       | Arbitrary JSON object stored alongside the example |

Unknown keys are stashed inside `metadata.extra` so nothing is lost.

## Judge rubric

The default judge returns strict JSON:

```json
{
  "correctness": 5,
  "factuality": 5,
  "completeness": 4,
  "conciseness": 4,
  "instruction_following": 5,
  "overall": 5,
  "reason": "short explanation"
}
```

Each score is clamped to the 1..5 range. If the judge wraps the JSON in markdown fences, the backend extracts the inner object automatically.

## API reference (selected)

| Method | Path                                  | Purpose                                  |
| ------ | ------------------------------------- | ---------------------------------------- |
| GET    | `/health`                             | Liveness probe                           |
| GET    | `/api/ollama/models`                  | List local Ollama models                 |
| POST   | `/api/datasets/upload`                | Upload a JSONL dataset                   |
| GET    | `/api/datasets`                       | List datasets                            |
| GET    | `/api/datasets/{id}`                  | Dataset + examples                       |
| DELETE | `/api/datasets/{id}`                  | Delete a dataset                         |
| GET    | `/api/prompts`                        | List prompt templates                    |
| POST   | `/api/prompts`                        | Create prompt template                   |
| PUT    | `/api/prompts/{id}`                   | Update prompt template                   |
| POST   | `/api/prompts/preview`                | Render a template against sample data    |
| POST   | `/api/runs`                           | Create benchmark run                     |
| POST   | `/api/runs/{id}/start`                | Kick off generation + judging in the background |
| GET    | `/api/runs/{id}/results`              | Per-output rows                          |
| GET    | `/api/runs/{id}/summary`              | Aggregated metrics per model             |
| GET    | `/api/runs/{id}/export.csv`           | Download CSV of results                  |
| GET    | `/api/insights/overview`              | Cross-run dashboard data                 |
| GET    | `/api/benchmarks/catalog`             | List supported public benchmarks         |
| POST   | `/api/benchmarks/import`              | Pull a benchmark (MMLU/HellaSwag) into a dataset |

## Optional: Docker

`docker-compose.yml` is provided for running Ollama (and optionally the backend) in containers:

```bash
docker compose up ollama                  # just Ollama
docker compose --profile full up --build  # Ollama + backend
```

## Roadmap ideas

- Concurrent generation per model (currently sequential per-example)
- Cost & token-budget tracking when using cloud models
- More benchmarks: HumanEval / MBPP (code + sandbox), GSM8K (math), ARC, TruthfulQA, TriviaQA (EM/F1)
- Log-likelihood scoring path (would require a non-Ollama runtime such as `llama.cpp`/`transformers` for canonical MMLU/HellaSwag numbers)
- Cross-run diffing in the Refinement page
- Multi-judge ensembling
