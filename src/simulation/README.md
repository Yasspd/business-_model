# Simulation Engine Notes

`latest simulation`:
Последний успешно завершённый run со статусом `completed`, сохранённый в in-memory store.

`summary` и `lastStep`:
`summary` содержит агрегаты по всему run и финальному состоянию системы.
`lastStep` содержит снимок только последнего шага внутри run.

`actionCountTotal`:
Общее число локальных действий за весь run без учёта `no_action`.

`hotEntitiesTotal`, `hotActiveEntities`, `maxHotEntities`:
`hotEntitiesTotal` — число уникальных сущностей, которые хотя бы раз были горячими за run.
`hotActiveEntities` — число горячих и ещё не завершённых сущностей в финальном состоянии.
`maxHotEntities` — максимальное число горячих сущностей одновременно на одном шаге.

`finalChaosIndex`, `maxChaosIndex`, `avgChaosIndex`:
`finalChaosIndex` — chaos index на последнем шаге.
`maxChaosIndex` — пиковое значение chaos index за весь run.
`avgChaosIndex` — среднее значение chaos index по всей step timeline.
