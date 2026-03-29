# Simulation Engine Notes

## `latest simulation`

Последний успешно завершённый run со статусом `completed`, сохранённый в in-memory store.

## `fixed` vs `adaptive`

`fixed`

- passive control group
- local и system actions отключены
- `actionCountTotal` и весь action breakdown должны быть равны нулю
- thresholds фиксированы и используются как report values

`adaptive`

- active decision mode
- thresholds и actions влияют не только на telemetry, но и на next-step dynamics через effects и `stressMemory`

`baseline`

- report-only mode
- decisions и systemAction попадают в telemetry
- immediate effects и control signals не применяются

`hybrid`

- runtime semantics близка к `adaptive`
- дополнительно возвращает `breakdown` по chaos sub-indexes

## `summary` и `lastStep`

`summary`

- агрегаты по всему run
- финальное состояние системы

`lastStep`

- snapshot только последнего шага

## Независимые и производные метрики

Независимые terminal outcomes:

- `stabilizedCount`
- `failedCount`

Производные:

- `finishedEntities = stabilizedCount + failedCount`
- `actionCount` — backward-compatible alias для `lastStepActionCount`

Hot metrics:

- `hotEntities` — hot entities в финальном состоянии
- `hotEntitiesTotal` — сколько уникальных entities были hot хотя бы раз
- `hotActiveEntities` — hot и ещё не завершённые entities в финале
- `maxHotEntities` — максимальное число hot entities на одном шаге

## `avgInfluence` и `avgVelocity`

Это агрегаты по всем entities на шаге, включая terminal entities, которые уже frozen.

После окончания события они могут оставаться ненулевыми из-за residual значений у завершённых entities.

## `avgCurrentInfluence`, `avgCurrentVelocity`

Средние значения только по ещё активным entities текущего шага.

После завершения active event именно эти поля должны уходить к нулю.

## `avgResidualInfluence`, `avgResidualVelocity`

Средние значения только по уже завершённым entities.

Они показывают residual carry-over после того, как event уже не активен.

## Trajectory divergence и terminal divergence

`trajectory divergence`

- доказывает расхождение по динамике модели
- chaos, temperature, thresholds, risk и step-level telemetry

`terminal divergence`

- доказывает расхождение уже по terminal outcomes
- `stabilizedCount` и/или `failedCount`

Они намеренно тестируются отдельно.

## Analysis layers

Все analysis-слои опциональны и включаются через `analysisOptions`.

`analysis.causal`

- simulation-interventional estimate
- paired reruns с одинаковым seed
- не является real-world causal claim

`analysis.robust`

- scenario-based policy evaluator
- сравнивает candidate policies на deterministic scenario matrix
- не является полноценным solver

`analysis.uncertainty`

- repeated seeded reruns
- empirical interval aggregation
- не является строгой внешней статистической гарантией

## Что гарантирует QA-слой

- contract invariants response shape
- determinism одинакового `seed`
- passive semantics режима `fixed`
- active semantics режима `adaptive`
- current vs residual telemetry semantics
- согласованность `summary`, `lastStep`, `steps` и entity history
- raw simulation result не меняется от включения `analysisOptions`

## Ограничения модели

- strongest adaptive effect обычно ожидается в `realistic` и `stress`
- в `demo` trajectory divergence может появляться раньше terminal divergence
- `hybrid` сейчас в основном расширяет telemetry, а не вводит новую policy semantics
