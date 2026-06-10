// Archivo: src/utils/money.js
// Propósito: centralizar monedas, normalización y formato de importes.

export const CURRENCY_OPTIONS = [
  {
    value: 'Dolares',
    label: 'Dólares',
    symbol: '$',
    helper: 'Dólares',
  },
  {
    value: 'Pesos',
    label: 'Pesos',
    symbol: '$',
    helper: 'Moneda nacional',
  },
];

export function normalizeCurrencyName(currency) {
  return String(currency || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function isCurrencySelected(currentCurrency, optionCurrency) {
  return normalizeCurrencyName(currentCurrency) === normalizeCurrencyName(optionCurrency);
}

export function isDollarCurrency(currency) {
  const normalizedCurrency = normalizeCurrencyName(currency);

  return normalizedCurrency.includes('dolar') || normalizedCurrency.includes('usd');
}

export function getCurrencyBucket(currency) {
  return isDollarCurrency(currency) ? 'dolares' : 'pesos';
}

export function formatAmount(value) {
  // Propósito: mostrar cantidades con comas y dos decimales para mejorar la lectura.
  const number = Number(value || 0);

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatMoneyByCurrency(amount) {
  return `$${formatAmount(amount || 0)}`;
}

export function renderCurrencyAmount(amount) {
  return Number(amount || 0) === 0 ? '--' : formatMoneyByCurrency(amount);
}

export function getAmountForCurrencyColumn(record, targetCurrency) {
  const shouldShowAmount =
    targetCurrency === 'Dólares'
      ? isDollarCurrency(record.moneda)
      : !isDollarCurrency(record.moneda);

  return shouldShowAmount ? formatMoneyByCurrency(record.cantidad) : '—';
}
