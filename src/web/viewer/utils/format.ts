export function fmtNumber(value: number | undefined | null): string {
  return value === undefined || value === null ? "-" : new Intl.NumberFormat("en-US").format(value);
}

export function fmtBytes(value: number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB"];
  let size = value / 1024;
  let unit = units[0]!;
  for (let i = 1; i < units.length && size >= 1024; i += 1) {
    size /= 1024;
    unit = units[i]!;
  }
  return `${size.toFixed(size >= 10 ? 0 : 1)} ${unit}`;
}

export function shortGuid(guid: string): string {
  return guid.length <= 12 ? guid : `${guid.slice(0, 8)}...${guid.slice(-4)}`;
}
