// Propósito: selector contextual de caja para cada apartado del sistema.

import { useCashBoxes } from '../hooks/useCashBoxes.js';
import SelectDropdown from './SelectDropdown.jsx';

function CashBoxSelector({ label = 'Caja', className = '' }) {
  const {
    cashBoxes,
    activeCashBoxId,
    selectCashBox,
    isCashBoxesLoading,
    cashBoxesError,
  } = useCashBoxes();
  const activeBoxes = cashBoxes.filter((cashBox) => cashBox.activa);

  return (
    <div className={`filter-box cash-box-page-selector ${className}`.trim()}>
      <label htmlFor="pageCashBoxSelector">{label}</label>
      <SelectDropdown
        id="pageCashBoxSelector"
        value={activeCashBoxId}
        options={activeBoxes.length === 0
          ? [{ value: '', label: isCashBoxesLoading ? 'Cargando cajas...' : 'Sin cajas activas' }]
          : activeBoxes.map((cashBox) => ({ value: cashBox.id, label: cashBox.nombre }))}
        onChange={(event) => selectCashBox(event.target.value)}
        disabled={isCashBoxesLoading || activeBoxes.length === 0}
        aria-label={`${label} seleccionada`}
        aria-describedby={cashBoxesError ? 'pageCashBoxSelectorError' : undefined}
      />
      {cashBoxesError && (
        <small id="pageCashBoxSelectorError" className="cash-box-selector-error" role="status">
          No se pudieron cargar las cajas.
        </small>
      )}
    </div>
  );
}

export default CashBoxSelector;
