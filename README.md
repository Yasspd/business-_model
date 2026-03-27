# Business Model Simulation Engine

NestJS + TypeScript backend для гибридной simulation/decision model.

Проект моделирует generic `Entity`-сущности, которые:
- переходят между состояниями по Markov transition matrix
- живут в нормализованном 2D-пространстве `[0, 1] x [0, 1]`
- реагируют на active event через influence, movement и temperature
- получают локальные и системные decisions в зависимости от risk/chaos telemetry

Текущий основной сценарий: `global-chaos-mvp`.

## Что моделируется

Основные доменные объекты:
- `Entity`: активная сущность с состоянием, координатами, temperature, influence, velocity, risk score и history
- `Event`: внешний драйвер системы, влияющий на influence и movement
- `Run`: один завершённый simulation run с `runId`, `summary`, `lastStep`, `steps` и `entities`
- `Step`: телеметрический снимок одного шага внутри run
- `Summary`: агрегаты по всему run и по финальному состоянию системы

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

После входа в terminal state entity замораживается:
- больше не двигается
- не обновляет influence / velocity / temperature
- не получает новых local actions
- не растит history на следующих шагах

## Runs, Steps и Telemetry

API возвращает несколько уровней данных:
- `summary`: итог по всему run
- `lastStep`: снимок только последнего шага
- `steps`: timeline step-by-step telemetry
- `entities`: финальное состояние entity-массива с history
- `activeEventSnapshot`: снимок primary event для run

Важно:
- `latest simulation` означает последний успешно завершённый run со статусом `completed`
- `entities` могут быть усечены через `returnEntitiesLimit`
- `summary` всегда считается по полному run, даже если `entities` усечены

## API

Доступные endpoints:
- `GET /simulation/scenarios`
- `GET /simulation/latest`
- `GET /simulation/runs`
- `GET /simulation/runs/:runId`
- `POST /simulation/run`

Основной запуск:
- `scenarioKey` обязателен
- `entitiesCount`: `10..5000`
- `steps`: `1..50`
- `mode`: `baseline | fixed | adaptive | hybrid`
- `profile`: `demo | realistic | stress`
- `seed` опционален, но важен для воспроизводимости
- `activeEventOverride` позволяет переопределить параметры primary event

## Режимы

| Mode | Что делает | Decisions | Immediate effects | Отличие |
| --- | --- | --- | --- | --- |
| `baseline` | Report-only режим | Да, decisions и system actions рассчитываются и попадают в telemetry | Нет | Показывает, что модель бы решила, но не применяет local/system effects и control-memory propagation |
| `fixed` | Контрольная группа | Нет, local actions отключены, system action всегда `system_normal` | Нет | Пассивный control group с фиксированными thresholds |
| `adaptive` | Активный рабочий режим | Да | Да | Thresholds и actions влияют на next-step dynamics через local/system effects и `stressMemory` |
| `hybrid` | Adaptive + расширенная диагностика | Да | Да | По runtime semantics сейчас близок к `adaptive`, но дополнительно возвращает step-level `breakdown` по chaos sub-indexes |

Текущая честная semantics:
- `baseline` не равен `fixed`
- `baseline` не пассивен по reporting-слою, но пассивен по effect-слою
- `hybrid` сейчас не отдельная control logic ветка, а `adaptive` с более подробной telemetry

## Profiles

| Profile | Текущая семантика |
| --- | --- |
| `demo` | Ближайший к базовому MVP профиль: без seeded noise, без event lifecycle и без delayed effects; наиболее консервативный по divergence |
| `realistic` | Включает lifecycle event, delayed effects, inertia и умеренный stochastic noise; лучше показывает segment differentiation |
| `stress` | Самый агрессивный профиль: сильнее event coupling, ниже барьер активации system layer и выше чувствительность для stress/regression прогонов |

Практический смысл:
- `demo` удобен для базовой контрольной проверки
- `realistic` ближе к правдоподобной динамике
- `stress` нужен для доказуемых divergence/regression сценариев

## Ключевые метрики

Независимые terminal outcomes:
- `stabilizedCount`
- `failedCount`

Производные метрики:
- `finishedEntities = stabilizedCount + failedCount`
- `actionCount` — backward-compatible alias для `lastStepActionCount`

Operational metrics:
- `actionCountTotal`: все локальные actions за весь run, кроме `no_action`
- `watchCountTotal`, `notifyCountTotal`, `dampenCountTotal`: breakdown по всему run
- `avgTemperature`: средняя температура по всем entities в финальном состоянии
- `avgInfluence`: средний influence по всем entities в финальном состоянии
- `avgRiskScore`: средний risk score по всем entities в финальном состоянии
- `avgFailureProbability`: средняя failure probability по всем entities в финальном состоянии
- `finalChaosIndex`: chaos index последнего шага
- `finalGlobalThreshold`: global threshold последнего шага
- `finalSystemAction`: system action последнего шага

Hot-related metrics:
- `hotEntities`: число hot entities в финальном состоянии
- `hotEntitiesTotal`: число уникальных entities, которые хотя бы раз были hot
- `hotActiveEntities`: число hot entities, которые в финале ещё не завершены
- `maxHotEntities`: максимальное число hot entities одновременно на одном шаге

## Telemetry semantics

`current` vs `residual`:
- `avgCurrentInfluence`, `avgCurrentVelocity` считаются только по ещё активным entities
- `avgResidualInfluence`, `avgResidualVelocity` считаются только по уже завершённым entities
- после окончания active event именно current-метрики должны уходить к нулю, residual-метрики могут оставаться ненулевыми

`avgInfluence` и `avgVelocity`:
- это агрегаты по всем entities, включая уже frozen terminal entities

`activeEvent` telemetry:
- каждый step содержит `activeEventIntensity`
- каждый step также содержит `eventSnapshot`
- в `hybrid` режиме step дополнительно содержит `breakdown` по chaos sub-indexes

History semantics:
- `steps` — system-level timeline
- `entities[].history` — entity-level snapshots по шагам
- history заполняется только пока entity активна

## QA layers

В проекте сейчас три основных QA-слоя.

`e2e layer`
- проверяет HTTP contract
- проверяет response shape и публичные endpoints
- покрывает latest runs, run retrieval, terminal freeze и current/residual telemetry

`unit engine layer`
- покрывает pure engines:
  - thresholds
  - actions
  - metrics
  - transitions
  - position math
  - scoring
- проверяет deterministic math, bounds, fallback logic и controlled formulas

`regression / service layer`
- проверяет orchestration через `SimulationService`
- покрывает matrix по profiles / modes / seeds
- проверяет determinism repeated runs
- проверяет fixed control-group correctness
- проверяет divergence между режимами

## QA guarantees

Что уже доказано текущим тестовым слоем:
- одинаковый `seed` даёт воспроизводимый результат на repeated runs
- `fixed` является пассивной control group
- `adaptive` расходится с `fixed` под сильным stress не только по telemetry, но и по terminal outcomes
- `trajectory divergence` и `terminal divergence` тестируются отдельно
- `summary`, `lastStep`, `steps` и `entities[].history` внутренне согласованы
- bounded metrics не уходят в `NaN`, `Infinity` и недопустимые диапазоны
- transition math, position math и scoring math покрыты отдельными unit tests
- terminal states реально freeze semantics, а не только label в summary

## Known limitations / current boundaries

- README описывает текущее состояние кода, а не будущие идеи
- `demo` профиль намеренно более консервативен; в нём trajectory divergence может появляться раньше, чем terminal divergence
- `hybrid` сейчас по runtime semantics очень близок к `adaptive`; его главное отличие — расширенный telemetry `breakdown`
- orchestration доказана сильным regression-слоем, но private internals `SimulationService` не разложены на полностью изолированные unit tests
- persistence остаётся in-memory; это подходит для локального анализа и QA, но не является database-backed storage

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
npm run test
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
- `summary` с итоговыми метриками по всему run
- `lastStep` как финальный step snapshot
- `steps` как timeline
- `entities` как финальные entity snapshots с history

Для короткой аналитики обычно достаточно смотреть:
- `summary.stabilizedCount`
- `summary.failedCount`
- `summary.finalChaosIndex`
- `summary.finalGlobalThreshold`
- `summary.finalSystemAction`
- `lastStep.actionsBreakdown`

## Дополнительные заметки

Более узкие notes по semantics лежат в [src/simulation/README.md](src/simulation/README.md).
