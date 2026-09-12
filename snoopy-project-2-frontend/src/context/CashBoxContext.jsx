// Propósito: conservar una sola caja activa entre Inicio, Movimientos y Reportes.

import { useEffect, useMemo, useState } from 'react';
import { getCashBoxes } from '../services/cashBoxesApi.js';
import { isAuthenticated } from '../utils/session.js';
import { CashBoxContext } from './cashBoxContext.js';

const SELECTED_CASH_BOX_KEY = 'snoopyProject2SelectedCashBoxId';

export function CashBoxProvider({ children }) {
  const [cashBoxes, setCashBoxes] = useState([]);
  const [activeCashBoxId, setActiveCashBoxId] = useState(() => {
    return localStorage.getItem(SELECTED_CASH_BOX_KEY) || '';
  });
  const [isCashBoxesLoading, setIsCashBoxesLoading] = useState(false);
  const [cashBoxesError, setCashBoxesError] = useState('');

  const loadCashBoxes = async () => {
    if (!isAuthenticated()) {
      setCashBoxes([]);
      setActiveCashBoxId('');
      return;
    }

    try {
      setIsCashBoxesLoading(true);
      setCashBoxesError('');

      const data = await getCashBoxes();
      const activeBoxes = data.filter((cashBox) => cashBox.activa);
      const storedId = localStorage.getItem(SELECTED_CASH_BOX_KEY);
      const selectedExists = activeBoxes.some((cashBox) => String(cashBox.id) === String(storedId));
      const nextId = selectedExists ? String(storedId) : String(activeBoxes[0]?.id || '');

      setCashBoxes(data);
      setActiveCashBoxId(nextId);

      if (nextId) {
        localStorage.setItem(SELECTED_CASH_BOX_KEY, nextId);
      } else {
        localStorage.removeItem(SELECTED_CASH_BOX_KEY);
      }
    } catch (error) {
      setCashBoxesError(error.message);
      setCashBoxes([]);
    } finally {
      setIsCashBoxesLoading(false);
    }
  };

  useEffect(() => {
    // La carga sincroniza el estado React con la sesión y la API externa.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCashBoxes();

    const handleAuthChange = () => loadCashBoxes();
    window.addEventListener('snoopy-auth-changed', handleAuthChange);

    return () => window.removeEventListener('snoopy-auth-changed', handleAuthChange);
  }, []);

  const selectCashBox = (id) => {
    const nextId = String(id);
    setActiveCashBoxId(nextId);
    localStorage.setItem(SELECTED_CASH_BOX_KEY, nextId);
  };

  const activeCashBox = useMemo(() => {
    return cashBoxes.find((cashBox) => String(cashBox.id) === String(activeCashBoxId)) || null;
  }, [cashBoxes, activeCashBoxId]);

  const value = useMemo(() => ({
    cashBoxes,
    activeCashBox,
    activeCashBoxId,
    isCashBoxesLoading,
    cashBoxesError,
    selectCashBox,
    reloadCashBoxes: loadCashBoxes,
  }), [cashBoxes, activeCashBox, activeCashBoxId, isCashBoxesLoading, cashBoxesError]);

  return <CashBoxContext.Provider value={value}>{children}</CashBoxContext.Provider>;
}
