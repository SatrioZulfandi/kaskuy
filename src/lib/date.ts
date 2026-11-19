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

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return isLeapYear ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isValidMonthString(value: string): boolean {
  return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidDateString(value: string): boolean {
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  return day <= daysInMonth(year, month);
}

export function formatDateString(date: Date): string {
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 1000 || date.getFullYear() > 9999) {
    throw new Error('Tanggal tidak valid.');
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getTodayDateString(): string {
  return formatDateString(new Date());
}

export function getCurrentMonthString(): string {
  return getTodayDateString().slice(0, 7);
}

export function getMonthRange(month: string): { startDate: string; endDate: string } {
  if (!isValidMonthString(month)) throw new Error('Bulan harus menggunakan format YYYY-MM yang valid.');
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    startDate: `${month}-01`,
    endDate: `${month}-${daysInMonth(year, monthNumber)}`,
  };
}

export function getDateStringsInRange(startDate: string, endDate: string): string[] {
  if (!isValidDateString(startDate) || !isValidDateString(endDate) || startDate > endDate) {
    throw new Error('Rentang tanggal tidak valid.');
  }
  const [year, month, day] = startDate.split('-').map(Number);
  // Use local calendar arithmetic, so UTC offsets and daylight saving do not shift dates.
  const current = new Date(year, month - 1, day, 12);
  const dates: string[] = [];
  let date = startDate;
  while (date <= endDate) {
    dates.push(date);
    if (date === endDate) break;
    current.setDate(current.getDate() + 1);
    date = formatDateString(current);
  }
  return dates;
}

export function shiftPeriodDate(
  period: PeriodFilter,
  anchorDate: Date,
  direction: -1 | 1
): Date {
  formatDateString(anchorDate);
  const next = new Date(anchorDate);
  if (period === 'Bulanan') {
    next.setDate(1);
    next.setMonth(next.getMonth() + direction);
  } else if (period === 'Tahunan') {
    next.setFullYear(next.getFullYear() + direction, 0, 1);
  } else {
    next.setDate(next.getDate() + direction * (period === 'Mingguan' ? 7 : 1));
  }
  formatDateString(next);
  return next;
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
  formatDateString(anchorDate);
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
        startDate: formatDateString(start),
        endDate: formatDateString(anchorDate),
      };
    }
    case 'Bulanan': {
      return getMonthRange(`${y}-${pad(m + 1)}`);
    }
    case 'Tahunan': {
      return {
        startDate: `${y}-01-01`,
        endDate: `${y}-12-31`,
      };
    }
  }
}
