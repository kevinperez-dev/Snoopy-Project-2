// Propósito: acceder al contexto de cajas desde cualquier pantalla.

import { useContext } from 'react';
import { CashBoxContext } from '../context/cashBoxContext.js';

export function useCashBoxes() {
  const context = useContext(CashBoxContext);

  if (!context) {
    throw new Error('useCashBoxes debe usarse dentro de CashBoxProvider.');
  }

  return context;
}
