// Archivo: src/utils/dates.js
// Propósito: centralizar funciones de fecha y semana ISO usadas por Inicio, Movimientos y Reportes.

export function getTodayISO() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function getShortMonth(monthIndex) {
  const months = [
    'ene.',
    'feb.',
    'mar.',
    'abr.',
    'may.',
    'jun.',
    'jul.',
    'ago.',
    'sep.',
    'oct.',
    'nov.',
    'dic.',
  ];

  return months[monthIndex];
}

export function getISOWeekInfo(dateISO) {
  const date = new Date(`${dateISO}T00:00:00`);
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayOfWeek = utcDate.getUTCDay() || 7;

  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayOfWeek);

  const isoYear = utcDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((utcDate - yearStart) / 86400000 + 1) / 7);

  return { year: isoYear, week };
}

export function getCurrentISOWeek() {
  return getISOWeekInfo(getTodayISO());
}

export function getISOWeekStart(year, week) {
  const simple = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = simple.getUTCDay() || 7;

  simple.setUTCDate(simple.getUTCDate() - dayOfWeek + 1);

  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() + (week - 1) * 7);

  return monday;
}

export function getWeekLabel(year, week) {
  const monday = getISOWeekStart(year, week);
  const sunday = new Date(monday);

  sunday.setUTCDate(monday.getUTCDate() + 6);

  const startDay = String(monday.getUTCDate()).padStart(2, '0');
  const endDay = String(sunday.getUTCDate()).padStart(2, '0');

  return `${week} (${startDay}-${getShortMonth(monday.getUTCMonth())} a ${endDay}-${getShortMonth(sunday.getUTCMonth())})`;
}

export function getMaxAllowedWeekForYear(year, records) {
  const currentWeek = getCurrentISOWeek();

  if (Number(year) === currentWeek.year) {
    return currentWeek.week;
  }

  const weeksWithData = records
    .map((record) => {
      const info = getISOWeekInfo(record.fecha);
      return info.year === Number(year) ? info.week : null;
    })
    .filter(Boolean);

  return weeksWithData.length > 0 ? Math.max(...weeksWithData) : 1;
}

export function formatShortDate(dateValue) {
  if (!dateValue) return '';

  // Propósito: separar manualmente la fecha para evitar desfases por zona horaria.
  const [year, month, day] = String(dateValue).split('-');

  const monthNames = {
    '01': 'ene',
    '02': 'feb',
    '03': 'mar',
    '04': 'abr',
    '05': 'may',
    '06': 'jun',
    '07': 'jul',
    '08': 'ago',
    '09': 'sep',
    '10': 'oct',
    '11': 'nov',
    '12': 'dic',
  };

  if (!year || !month || !day || !monthNames[month]) {
    return dateValue;
  }

  return `${day}/${monthNames[month]}`;
}
