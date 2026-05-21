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

Upload a JSONL benchmark dataset, select one or more locally installed Ollama models, run the same prompt template across all of them, score outputs with an LLM judge, visualize quality and latency, then iterate on the prompt/template.

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

1. **Upload a dataset.** Go to **Datasets → Upload JSONL** and drop in `data/sample_dataset.jsonl`.
2. **Inspect local models.** Visit **Models** to confirm Ollama is reachable.
3. **Create a prompt template.** Use **Prompts** to keep or customize the default `{{input}}` template. Variables `{{input}}`, `{{reference}}`, `{{category}}`, and `{{difficulty}}` are available.
4. **Configure a run.** On **Runs**, pick a dataset, a prompt, one or more generator models, and a judge model. Hit **Create & start run**.
5. **Watch the dashboard.** The run page polls for progress. Once it completes you will see per-model averages, latency, and the full results table.
6. **Explore insights.** Visit **Insights** for cross-run charts (radar, scatter, ranking).
7. **Refine.** **Refinement** surfaces the lowest-scoring examples and lets you fork a new improved prompt template.

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

## Optional: Docker

`docker-compose.yml` is provided for running Ollama (and optionally the backend) in containers:

```bash
docker compose up ollama                  # just Ollama
docker compose --profile full up --build  # Ollama + backend
```

## Roadmap ideas

- Concurrent generation per model (currently sequential per-example)
- Cost & token-budget tracking when using cloud models
- Pull-from-HuggingFace dataset import
- Cross-run diffing in the Refinement page
- Multi-judge ensembling
