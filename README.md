# Collaborative Physics Lab

Collaborative Physics Lab is a research sandbox for exploring multi-agent reasoning over advanced physics problems. The
application pairs a React front end with the Void Dynamics learning graph so autonomous agents can exchange structured
context, ground their deductions in shared memory, and persist the resulting breakthroughs.

## Feature Highlights

- **Void Dynamics memory manager** – a Python learning graph that tracks reinforcement, novelty, inhibition, and territory
  formation for every memory trace while guaranteeing deterministic persistence.
- **Hybrid knowledge retrieval** – combines void-refined semantic context, bag-of-words ranking, and tagged knowledge graph
  traversal to build high-signal prompts for each agent turn.
- **Autonomous orchestration** – centralised configuration defaults, stop conditions, and structured status reporting so
  long-running derivations can be monitored and paused safely.
- **End-to-end validation** – Vitest and Python unittest suites cover cross-runtime interactions, lifecycle events, and
  regression scenarios to keep the collaboration loop stable.
- **Failure-injection regression coverage** – targeted Python tests stress reinforcement, decay, and condensation under
  simulated queue backpressure to ensure the learning graph recovers without data loss.
- **Continuous integration** – GitHub Actions executes linting, builds, and all automated tests on every push or pull request.
- **Nightly telemetry pipeline** – scheduled probes capture heat decay, reward EMA, and territory churn and publish the
  results as Markdown and JSON reports for operational review.

## Architecture

The repository follows the Hybrid-Clean guidance published in [`docs/architecture.md`](docs/architecture.md):

- **Presentation layer** – React components in `src/components` orchestrate UI state while depending only on application
  services.
- **Business logic** – shared TypeScript utilities in `src/lib` coordinate context assembly, autonomous safeguards, and
  knowledge ingestion.
- **Domain layer** – `src/types` provides framework-independent models that describe agent settings, memory traces, and
  collaboration structures.
- **Infrastructure layer** – the Python package under `src/void_dynamics` implements the learning graph, persistence, and
  territory heuristics exposed to the rest of the stack through a JSON bridge.

Refer to [`docs/void-dynamics.md`](docs/void-dynamics.md) for deep dives into the memory manager API, benchmarking advice, and
migration steps.

## Getting Started

### Prerequisites

- Node.js ≥ 18 and npm ≥ 9
- Python ≥ 3.10 (standard library only) for the Void Dynamics manager and unit tests

If your environment restricts outbound traffic, obtain the required npm tarballs in advance or configure access to an internal
registry mirror before running installation commands.

### Installation

```bash
npm install
```

### Local Development

```bash
npm run dev        # Start the Vite development server
npm run lint       # Run ESLint across the TypeScript/React codebase
npm run test       # Execute the Vitest suite, including Node↔Python integration coverage
python -m unittest discover -s tests -t .  # Run the Python regression suite
```

### Production Build

```bash
npm run build
```

The build pipeline compiles TypeScript, generates the optimised Vite bundle, and validates Tailwind styling using the shared
spacing tokens defined in `src/main.css`.

## Operating the Void Dynamics Memory System

- Register and reinforce memories through the manager interface; confidence, novelty, boredom, and TTL are clamped and updated
  automatically to satisfy lifecycle constraints.
- Persistence is deterministic: use `VoidMemoryManager.save_json` and `VoidMemoryManager.load_json` to snapshot or restore state
  without external dependencies.
- Events, condensation callbacks, and diffusion cycles surface through structured buffers so downstream services can react to
  territory splits, merges, or degradation.
- The migration script `scripts/migrate-autonomous-config.mjs` upgrades existing configuration files with the required metadata
  and sensible defaults.

Additional lifecycle details, persistence keys, and operational guardrails are catalogued in the dedicated documentation under
`docs/`.

## Autonomous Execution & Monitoring

Autonomous runs derive their settings from the central configuration utilities in `src/lib/autonomous-utils.ts`. The
`AgentCollaboration`, `AutonomousEngine`, and status components consume those helpers to:

- auto-start when autonomous mode is enabled,
- respect cycle limits, quiet hours, and Phys-Gamma review pauses,
- surface actionable stop reasons, and
- maintain void-refined semantic context between responses.

## Nightly Telemetry & Trend Analysis

- Generate nightly probes with `python scripts/nightly_telemetry.py`; the script can
  target live snapshots via `--snapshot` or run synthetic stress cycles.
- Review the resulting artifacts in `reports/void-telemetry-latest.json` and
  `reports/void-telemetry-latest.md`, or consult the scheduled workflow in
  `.github/workflows/nightly-telemetry.yml`.
- Automated anomaly detection enforces reward EMA floors and heat spike limits;
  the script exits non-zero (and the workflow fails) when thresholds are
  breached.
- Override the defaults via `--reward-floor`, `--max-avg-heat-delta`, and
  `--max-heat` to tune alert sensitivity for local experiments.
- See [`docs/operations/telemetry.md`](docs/operations/telemetry.md) for
  troubleshooting guidance, workflow details, and extension ideas.

## Disaster Recovery Runbook

- Follow [`docs/runbooks/memory-restore.md`](docs/runbooks/memory-restore.md) to
  validate snapshots, restore persistence safely, and replay collaboration
  history after an outage.
- Use the telemetry probe with `--snapshot` to confirm the restored graph matches
  expected reward and heat trends before reopening autonomous operations.
- Quarterly drills are automated via `scripts/disaster_recovery_drill.py` and
  the scheduled workflow `.github/workflows/quarterly-disaster-drill.yml`, which
  uploads Markdown/JSON reports under `reports/drills/` for auditing.

## Quality Assurance

The CI workflow `.github/workflows/ci.yml` enforces the full verification stack on every change:

1. `npm run lint`
2. `npm run test`
3. `npm run build`
4. `python -m unittest discover -s tests -t .`

A detailed checklist of historical changes and outstanding hardening work lives in [`CHECKLIST.md`](CHECKLIST.md).

## Contributing

1. Fork or clone the repository.
2. Install dependencies and run the full test suite.
3. Follow the Hybrid-Clean layering rules—never introduce direct dependencies from presentation components to infrastructure
   implementations.
4. Open a pull request with passing checks and reference any relevant documentation updates.

## License

This project is released under the MIT License. See [`LICENSE`](LICENSE) for details.
