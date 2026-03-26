export interface WeightedOption<T extends string> {
  value: T;
  weight: number;
}

export function clamp(value: number, min = 0, max = 1): number {
  if (Number.isNaN(value)) {
    return min;
  }

  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function std(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const mu = mean(values);
  const variance = mean(values.map((value) => (value - mu) ** 2));

  return Math.sqrt(variance);
}

export function distance2D(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x1 - x2;
  const dy = y1 - y2;

  return Math.sqrt(dx ** 2 + dy ** 2);
}

export function weightedRandomPick<T extends string>(
  options: Array<WeightedOption<T>>,
  randomValue: number,
): T {
  if (options.length === 0) {
    throw new Error(
      'Для взвешенного случайного выбора нужен хотя бы один вариант',
    );
  }

  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);

  if (totalWeight <= 0) {
    throw new Error(
      'Для взвешенного случайного выбора нужна положительная сумма весов',
    );
  }

  const threshold = clamp(randomValue, 0, 1) * totalWeight;
  let cumulativeWeight = 0;

  for (let index = 0; index < options.length; index += 1) {
    cumulativeWeight += options[index].weight;

    if (threshold <= cumulativeWeight || index === options.length - 1) {
      return options[index].value;
    }
  }

  return options[options.length - 1].value;
}

export function normalizeOptional(
  value: number | undefined,
  fallback: number,
): number {
  return value ?? fallback;
}
