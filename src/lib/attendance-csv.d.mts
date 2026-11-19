export interface CsvColumn {
  key: string;
  header: string;
  value?: (row: Record<string, unknown>) => unknown;
}

export function escapeCsvValue(value: unknown): string;
export function toCsv(
  rows: Array<Record<string, unknown>>,
  columns: CsvColumn[]
): string;
