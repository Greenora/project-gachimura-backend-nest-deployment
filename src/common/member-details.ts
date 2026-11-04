export function normalizePhone(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;
}

export function parseBirthDate(value: unknown): Date | null | undefined {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return new Date(NaN);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const legacy = /^(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match && !legacy) return new Date(NaN);

  const parts = match ?? legacy!;
  let year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);
  if (legacy) {
    const now = new Date();
    year += Math.floor(now.getFullYear() / 100) * 100;
    if (
      year > now.getFullYear() ||
      (year === now.getFullYear() &&
        (month > now.getMonth() + 1 ||
          (month === now.getMonth() + 1 && day > now.getDate())))
    ) {
      year -= 100;
    }
  }

  // The existing DATETIME column stores calendar dates in the server's local time.
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : new Date(NaN);
}

export function formatBirthDate(value?: Date | null): string | null {
  if (!value || !Number.isFinite(value.getTime())) return null;
  return [value.getFullYear(), value.getMonth() + 1, value.getDate()]
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, '0'))
    .join('-');
}
