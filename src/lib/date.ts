// src/lib/date.ts
import type { PeriodFilter } from '../types';

export const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'
];

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentMonthString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatReadableDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;

  const day = parseInt(parts[2], 10);
  const monthIdx = parseInt(parts[1], 10) - 1;
  const year = parts[0];

  return `${day} ${MONTH_SHORT[monthIdx] || ''} ${year}`;
}

export function formatMonthYear(monthStr: string): string {
  // YYYY-MM
  const parts = monthStr.split('-');
  if (parts.length !== 2) return monthStr;
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${MONTH_SHORT[monthIdx] || ''} ${parts[0]}`;
}

export function getPeriodRange(
  period: PeriodFilter,
  anchorDate = new Date()
): { startDate: string; endDate: string } {
  const y = anchorDate.getFullYear();
  const m = anchorDate.getMonth();
  const d = anchorDate.getDate();

  const pad = (n: number) => String(n).padStart(2, '0');

  switch (period) {
    case 'Harian': {
      const dateStr = `${y}-${pad(m + 1)}-${pad(d)}`;
      return { startDate: dateStr, endDate: dateStr };
    }
    case 'Mingguan': {
      // 7 days ending on anchorDate
      const start = new Date(anchorDate);
      start.setDate(anchorDate.getDate() - 6);
      return {
        startDate: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
        endDate: `${y}-${pad(m + 1)}-${pad(d)}`,
      };
    }
    case 'Bulanan': {
      const lastDay = new Date(y, m + 1, 0).getDate();
      return {
        startDate: `${y}-${pad(m + 1)}-01`,
        endDate: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
      };
    }
    case 'Tahunan': {
      return {
        startDate: `${y}-01-01`,
        endDate: `${y}-12-31`,
      };
    }
  }
}
