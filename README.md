# Business Model Simulation Engine

NestJS + TypeScript backend для simulation / decision engine. Проект моделирует динамику generic `Entity`-сущностей в 2D-пространстве, совмещая:

- Markov state transitions
- event-driven spatial movement
- local/system decisions
- risk / chaos telemetry
- optional analysis layers для causal, robust и uncertainty оценки

Текущий основной сценарий: `global-chaos-mvp`.

## Что моделируется

Ключевые доменные объекты:

- `Entity`: активная сущность с состоянием, координатами, temperature, influence, velocity, risk score и history
- `Event`: внешний драйвер системы, влияющий на movement и influence
- `Run`: один завершённый simulation run с `runId`, `summary`, `lastStep`, `steps`, `entities`
- `Step`: telemetry snapshot одного шага
- `Summary`: агрегаты по всему run
- `Analysis`: опциональный extension block поверх готового run, который не меняет raw simulation result

Состояния в текущем MVP:

- `calm`
- `interested`
- `reactive`
- `critical`
- `stabilized`
- `failed`

Terminal states по текущей semantics:

- `stabilized`
- `failed`

После входа в terminal state entity freeze-ится:

- не двигается
- не обновляет temperature / influence / velocity
- не получает новые local actions
- не растит history на следующих шагах

## Runs, Steps и Telemetry

API возвращает несколько уровней данных:

- `summary`: итог по всему run
- `lastStep`: snapshot только последнего шага
- `steps`: timeline step-by-step telemetry
- `entities`: финальные entity snapshots с history
- `activeEventSnapshot`: primary event для run
- `analysis`: опциональный analysis block, если включены feature flags

Важно:

- `latest simulation` означает последний успешно завершённый run со статусом `completed`
- `entities` могут быть усечены через `returnEntitiesLimit`
- `summary` всегда считается по полному run
- `analysis` не подменяет `summary`, `steps` или `entities`, а только дополняет их

## API

Доступные endpoints:

- `GET /simulation/scenarios`
- `GET /simulation/latest`
- `GET /simulation/runs`
- `GET /simulation/runs/:runId`
- `POST /simulation/run`

Основной request:

- `scenarioKey` обязателен
- `entitiesCount`: `10..5000`
- `steps`: `1..50`
- `mode`: `baseline | fixed | adaptive | hybrid`
- `profile`: `demo | realistic | stress`
- `seed`: опционален, но важен для воспроизводимости
- `activeEventOverride`: позволяет переопределить параметры primary event
- `analysisOptions`: опционально включает analysis layers

## Режимы

| Mode | Семантика | Decisions | Immediate effects | Отличие |
| --- | --- | --- | --- | --- |
| `baseline` | Report-only mode | Да | Нет | Модель считает decisions и telemetry, но не применяет local/system effects |
| `fixed` | Passive control group | Нет | Нет | Локальные и системные actions отключены, thresholds фиксированы |
| `adaptive` | Active policy mode | Да | Да | Thresholds и actions влияют на next-step dynamics |
| `hybrid` | Adaptive + expanded telemetry | Да | Да | Runtime semantics близка к `adaptive`, но добавляет `breakdown` по chaos sub-indexes |

Текущая честная semantics:

- `fixed` — реальная passive control group
- `baseline` — не равен `fixed`, а остаётся report-only mode
- `adaptive` и `hybrid` — active decision modes
- `hybrid` сейчас логически близок к `adaptive`, а не отдельная policy branch

## Profiles

| Profile | Текущая semantics |
| --- | --- |
| `demo` | Ближайший к базовому MVP: без seeded noise, без delayed effects, наиболее консервативный по divergence |
| `realistic` | Включает event lifecycle, delayed effects, inertia и умеренный stochastic noise |
| `stress` | Самый агрессивный профиль: сильнее event coupling, ниже barrier для system layer, лучше для stress / regression прогонов |

Практический смысл:

- `demo` удобен для базовой демонстрации
- `realistic` ближе к правдоподобной динамике
- `stress` нужен для доказуемых divergence / control-policy сценариев

## Ключевые метрики

Независимые terminal outcomes:

- `stabilizedCount`
- `failedCount`

Производные метрики:

- `finishedEntities = stabilizedCount + failedCount`
- `actionCount` — backward-compatible alias для `lastStepActionCount`

Operational metrics:

- `actionCountTotal`: все local actions за весь run, кроме `no_action`
- `watchCountTotal`, `notifyCountTotal`, `dampenCountTotal`: breakdown по всему run
- `avgTemperature`
- `avgInfluence`
- `avgRiskScore`
- `avgFailureProbability`
- `finalChaosIndex`
- `finalGlobalThreshold`
- `finalSystemAction`

Hot-related metrics:

- `hotEntities`: hot entities в финальном состоянии
- `hotEntitiesTotal`: сколько уникальных entities были hot хотя бы раз
- `hotActiveEntities`: сколько hot entities в финале ещё не завершены
- `maxHotEntities`: пик hot entities на одном шаге

## Telemetry semantics

`current` vs `residual`:

- `avgCurrentInfluence`, `avgCurrentVelocity` считаются только по ещё активным entities
- `avgResidualInfluence`, `avgResidualVelocity` считаются только по уже завершённым entities
- после окончания active event именно current-метрики должны уходить к нулю

`avgInfluence` и `avgVelocity`:

- это агрегаты по всем entities, включая frozen terminal entities

`activeEvent` telemetry:

- каждый step содержит `activeEventIntensity`
- каждый step содержит `eventSnapshot`
- `hybrid` дополнительно возвращает `breakdown` по chaos sub-indexes

History semantics:

- `steps` — system-level timeline
- `entities[].history` — entity-level snapshots по шагам
- history заполняется только пока entity активна

## Analysis layers

Все новые analysis-слои опциональны и включаются через `analysisOptions`. Если флагов нет, endpoint работает как раньше.

### Causal layer

`analysis.causal` — это simulation-interventional estimate, а не real-world causal claim.

Phase 1 делает честный paired rerun подход:

- одинаковый `seed`
- одинаковый baseline run
- меняется только одна интервенция

Поддерживаемые интервенции первого этапа:

- mode comparison `adaptive -> fixed`
- local actions on/off
- system actions on/off
- event stronger / weaker
- threshold sensitivity shift

Что возвращается:

- `targetMetric`
- `comparisons[]`
- `baselineValue`
- `treatedValue`
- `estimatedEffect`
- `effectDirection`
- `confidenceLabel`
- `evidenceLabel`
- `topDrivers`
- `chaosDrivers`

### Robust layer

`analysis.robust` — scenario-based policy evaluator, а не полноценный solver.

Layer сравнивает candidate policies:

- `baseline`
- `fixed`
- `adaptive`
- `hybrid`

И гоняет их по deterministic scenario matrix с perturbations:

- event intensity
- event relevance / scope
- noise pressure
- reactive segment mix
- stress-memory pressure
- threshold sensitivity

Что возвращается:

- `objective`
- `candidatePolicies`
- `recommendedPolicy`
- `scenarioCount`
- `expectedScores`
- `worstCaseScores`
- `tailRiskScores`
- `ranking`
- `frontier`

### Uncertainty layer

`analysis.uncertainty` — practical uncertainty block для ключевых outputs.

Phase 1 использует:

- repeated seeded reruns
- empirical interval aggregation
- optional calibrated widening для finite-sample interval

Это не "научная 95% истина", а честный simulation uncertainty estimate.

Что возвращается:

- `failureRate`
- `chaosIndex`
- `stabilizedCount`
- `failedCount`
- `avgRiskScore`
- `recommendedPolicyScore`, если robust layer включён

## analysisOptions

Короткий пример:

```json
{
  "scenarioKey": "global-chaos-mvp",
  "entitiesCount": 100,
  "steps": 8,
  "mode": "adaptive",
  "profile": "stress",
  "seed": 123,
  "analysisOptions": {
    "causal": {
      "enabled": true,
      "targetMetric": "failureRate",
      "maxInterventions": 6
    },
    "robust": {
      "enabled": true,
      "objective": "balanced_resilience",
      "scenarioCount": 6
    },
    "uncertainty": {
      "enabled": true,
      "level": 0.95,
      "method": "calibrated_empirical_interval",
      "resamples": 8
    }
  }
}
```

Упрощённые boolean flags тоже поддерживаются:

```json
{
  "analysisOptions": {
    "causal": true,
    "robust": true,
    "uncertainty": true
  }
}
```

## QA layers

В проекте сейчас четыре основных QA-слоя.

`e2e layer`

- проверяет HTTP contract
- проверяет response shape и backward compatibility
- покрывает latest runs, terminal freeze, current/residual telemetry
- проверяет optional `analysis` blocks

`unit engine layer`

- покрывает pure engines:
  - thresholds
  - actions
  - metrics
  - transitions
  - position math
  - scoring
  - causal
  - robust
  - uncertainty

`regression / service layer`

- проверяет orchestration через `SimulationService`
- покрывает matrix по profiles / modes / seeds
- проверяет determinism repeated runs
- проверяет fixed control-group correctness
- проверяет raw-run invariants при включённом analysis

`invariants layer`

- защищает bounded metrics
- проверяет monotonic cumulative counters
- проверяет terminal freeze semantics
- проверяет ordered uncertainty intervals

## QA guarantees

Что уже доказано текущим тестовым слоем:

- одинаковый `seed` даёт воспроизводимый результат
- `fixed` остаётся passive control group
- `baseline` остаётся report-only mode
- `adaptive` расходится с `fixed` под сильным stress
- `trajectory divergence` и `terminal divergence` тестируются отдельно
- `summary`, `lastStep`, `steps` и `entities[].history` внутренне согласованы
- bounded metrics не уходят в `NaN`, `Infinity` и недопустимые диапазоны
- `analysis` не меняет raw simulation result, если включён только как extension block
- uncertainty intervals удовлетворяют `lower <= point <= upper`
- causal / robust / uncertainty blocks остаются конечными и детерминированными

## Known limitations / current boundaries

- README описывает текущее состояние кода, а не будущие идеи
- causal layer в Phase 1 — это controlled simulation intervention, а не real-world causality
- robust layer в Phase 1 — scenario-based evaluator, а не полноценный optimizer/solver
- uncertainty layer в Phase 1 — empirical simulation interval, а не строгая внешняя статистическая гарантия
- `demo` profile намеренно более консервативен; в нём trajectory divergence может появляться раньше terminal divergence
- `hybrid` по runtime semantics остаётся близок к `adaptive`
- persistence остаётся in-memory

## How to run

Установка:

```bash
npm install
```

Запуск:

```bash
npm run start:dev
```

Проверки:

```bash
npm run lint
npm run build
npm run test -- --runInBand
npm run test:e2e -- --runInBand
```

## Пример запуска simulation

```bash
curl -X POST http://localhost:3000/simulation/run \
  -H "Content-Type: application/json" \
  -d "{\"scenarioKey\":\"global-chaos-mvp\",\"entitiesCount\":100,\"steps\":6,\"mode\":\"adaptive\",\"profile\":\"stress\",\"seed\":123,\"returnEntitiesLimit\":10}"
```

Что вернётся:

- `runId`, `startedAt`, `finishedAt`, `status`
- `summary`
- `lastStep`
- `steps`
- `entities`
- `analysis`, если включены feature flags

Для быстрого чтения обычно достаточно:

- `summary.stabilizedCount`
- `summary.failedCount`
- `summary.finalChaosIndex`
- `summary.finalGlobalThreshold`
- `summary.finalSystemAction`
- `analysis.causal.topDrivers`
- `analysis.robust.recommendedPolicy`
- `analysis.uncertainty.metrics.failureRate`

## Дополнительные заметки

Более узкие notes по semantics лежат в [src/simulation/README.md](src/simulation/README.md).
