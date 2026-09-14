// Archivo: src/utils/folio.js
// Propósito: generar folios automáticos con base en fecha y movimientos existentes.

export function generateAutoFolio(dateISO, records, cashBoxKey = '') {
  if (!dateISO) return '';

  // Propósito: formar el prefijo del folio con la fecha seleccionada.
  // Ejemplo: 2026-05-10 => 260510.
  const [year, month, day] = dateISO.split('-');
  const datePrefix = `${year.slice(-2)}${month}${day}`;
  const normalizedCashBoxKey = String(cashBoxKey || '').trim().toUpperCase();
  const prefix = /^[A-Z]+$/.test(normalizedCashBoxKey)
    ? `${normalizedCashBoxKey}-${datePrefix}`
    : datePrefix;

  // Propósito: revisar todos los folios existentes del mismo día para evitar duplicados.
  const recordsOfDay = records.filter((record) => {
    const recordFolio = String(record.folio || '');

    return recordFolio.startsWith(prefix);
  });

  // Propósito: obtener la secuencia más alta ya usada para esa fecha.
  const maxSequence = recordsOfDay.reduce((max, record) => {
    const recordFolio = String(record.folio || '');
    const numeric = parseInt(recordFolio.slice(prefix.length), 10);

    return !Number.isNaN(numeric) && numeric > max ? numeric : max;
  }, 0);

  return `${prefix}${String(maxSequence + 1).padStart(2, '0')}`;
}
