# Simulation Engine Notes

`latest simulation`
Последний успешно завершённый run со статусом `completed`, сохранённый в in-memory store.

`fixed` vs `adaptive`
`fixed` — контрольная группа.
В `fixed` режиме локальные и системные actions не применяются, `actionCountTotal` и все action breakdown должны оставаться равны нулю, а thresholds используются только как фиксированные report values.
`adaptive` — активный режим.
В `adaptive` режиме thresholds и actions влияют не только на telemetry, но и на next-step dynamics через `stressMemory`.

`summary` и `lastStep`
`summary` содержит агрегаты по всему run и по финальному состоянию системы.
`lastStep` содержит снимок только последнего шага внутри run.

Независимые и производные метрики
`stabilizedCount` и `failedCount` — независимые terminal outcomes.
`finishedEntities` — производная метрика и всегда должна быть равна `stabilizedCount + failedCount`.
`actionCount` — backward-compatible alias для `lastStepActionCount`.
`hotEntities` — число горячих сущностей в финальном состоянии.
`hotEntitiesTotal` — число уникальных сущностей, которые хотя бы раз были горячими за весь run.
`hotActiveEntities` — число горячих и ещё не завершённых сущностей в финальном состоянии.
`maxHotEntities` — максимальное число горячих сущностей одновременно на одном шаге.

`avgInfluence` и `avgVelocity`
Это агрегаты по всем сущностям на шаге, включая terminal entities, которые уже заморожены.
После завершения события эти поля могут оставаться ненулевыми из-за residual значений у завершённых сущностей.

`avgCurrentInfluence`, `avgCurrentVelocity`
Средние значения только по ещё активным сущностям текущего шага.
После завершения события именно эти поля должны уходить к нулю.

`avgResidualInfluence`, `avgResidualVelocity`
Средние значения только по уже завершённым сущностям.
Они показывают residual carry-over после того, как событие уже неактивно.

Trajectory divergence и terminal divergence
Trajectory divergence доказывает, что `fixed` и `adaptive` расходятся по самой динамике модели:
chaos, temperature, thresholds, risk и step-level telemetry.
Terminal divergence доказывает, что это расхождение дошло до независимых terminal outcomes:
`stabilizedCount` или `failedCount`.
Эти два доказательства намеренно разделены в QA-слое, потому что расхождение траектории возможно даже тогда, когда terminal outcomes ещё совпадают.

Что гарантирует QA-слой
Проверяются contract invariants response shape.
Проверяется детерминированность одинакового `seed`.
Проверяется пассивность `fixed` режима.
Проверяется активность `adaptive` режима.
Проверяется trajectory divergence между `fixed` и `adaptive`.
Проверяется terminal divergence в сильном stress-сценарии.
Проверяется корректная семантика current vs residual telemetry после завершения события.
Проверяется согласованность `summary`, `lastStep`, `steps` и entity history.

Ограничения модели
Самый заметный effect от adaptive-control ожидается в профилях `realistic` и `stress`.
В `demo` profile coupling намеренно слабее, чтобы не ломать базовый MVP.
Поэтому в `demo` возможна ситуация, когда траектория уже расходится, а terminal outcomes ещё совпадают.
