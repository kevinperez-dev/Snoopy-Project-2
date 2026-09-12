// Propósito: permitir el conteo físico por denominaciones y la revisión de movimientos.

import { useCallback, useEffect, useMemo, useState } from 'react';

import Header from '../components/Header.jsx';
import CashBoxSelector from '../components/CashBoxSelector.jsx';
import SelectDropdown from '../components/SelectDropdown.jsx';
import Toast from '../components/ui/Toast.jsx';
import { getBalanceMovements, createBalance } from '../services/balancesApi.js';
import { formatMoneyByCurrency, isDollarCurrency } from '../utils/money.js';
import { getCurrentISOWeek, getISOWeekStart, getWeekLabel, formatShortDate } from '../utils/dates.js';
import { isAuthenticated } from '../utils/session.js';
import { useCashBoxes } from '../hooks/useCashBoxes.js';

const DENOMINATIONS = {
    Pesos: [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1],
    Dolares: [100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01],
};

function formatDenomination(value) {
    return Number(value).toLocaleString('en-US', {
        minimumFractionDigits: value < 1 ? 2 : 0,
        maximumFractionDigits: 2,
    });
}

function formatDifference(value) {
    const amount = Number(value || 0);
    const prefix = amount > 0 ? '+' : '';
    return `${prefix}${formatMoneyByCurrency(amount)}`;
}

function getWeekEndISO(year, week) {
    const sunday = new Date(getISOWeekStart(year, week));
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    return sunday.toISOString().slice(0, 10);
}

function Balances() {
    const { activeCashBoxId } = useCashBoxes();
    const [currency, setCurrency] = useState('Pesos');
    const [selectedWeekNumber, setSelectedWeekNumber] = useState(() => {
        return String(getCurrentISOWeek().week);
    });
    const [systemBalance, setSystemBalance] = useState(0);
    const [movements, setMovements] = useState([]);
    const [quantities, setQuantities] = useState({});
    const [checkedMovementIds, setCheckedMovementIds] = useState(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [apiError, setApiError] = useState('');
    const [toast, setToast] = useState(null);

    const denominationList = DENOMINATIONS[currency];
    const countedTotal = useMemo(() => {
        return denominationList.reduce((total, denomination) => {
            return total + denomination * Number(quantities[denomination] || 0);
        }, 0);
    }, [denominationList, quantities]);

    const difference = countedTotal - Number(systemBalance || 0);
    const status = Math.abs(difference) < 0.005
        ? 'cuadrada'
        : difference < 0 ? 'faltante' : 'sobrante';

    const currentWeek = getCurrentISOWeek();
    const weekOptions = useMemo(() => Array.from(
        { length: currentWeek.week },
        (_, index) => ({ year: currentWeek.year, week: currentWeek.week - index })
    ), [currentWeek.year, currentWeek.week]);

    const selectedWeek = weekOptions.find(
        (weekOption) => String(weekOption.week) === selectedWeekNumber
    ) || weekOptions[0];
    const effectiveWeekValue = selectedWeek
        ? String(selectedWeek.week)
        : '';
    const cutoffDate = selectedWeek
        ? getWeekEndISO(selectedWeek.year, selectedWeek.week)
        : '';

    const loadBalanceData = useCallback(async () => {
        if (!activeCashBoxId || !cutoffDate || !isAuthenticated()) return;

        try {
            setIsLoading(true);
            setApiError('');
            const data = await getBalanceMovements({
                cajaId: activeCashBoxId,
                moneda: currency,
                fecha: cutoffDate,
            });
            setSystemBalance(Number(data.saldo_sistema || 0));
            setMovements(data.movements || []);
            setCheckedMovementIds(new Set());
            setQuantities({});
        } catch (error) {
            setApiError(error.message || 'No se pudo preparar la balanza.');
        } finally {
            setIsLoading(false);
        }
    }, [activeCashBoxId, currency, cutoffDate]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadBalanceData();
    }, [loadBalanceData]);

    useEffect(() => {
        if (!toast) return undefined;
        const timeoutId = setTimeout(() => setToast(null), 2800);
        return () => clearTimeout(timeoutId);
    }, [toast]);

    const updateQuantity = (denomination, value) => {
        const normalizedValue = value.replace(/[^0-9]/g, '');
        setQuantities((current) => ({
            ...current,
            [denomination]: normalizedValue,
        }));
    };

    const toggleMovement = (movementId) => {
        setCheckedMovementIds((current) => {
            const next = new Set(current);
            if (next.has(movementId)) next.delete(movementId);
            else next.add(movementId);
            return next;
        });
    };

    const saveBalance = async () => {
        if (!activeCashBoxId) return;

        try {
            setIsSaving(true);
            const balance = await createBalance({
                caja_id: Number(activeCashBoxId),
                fecha: cutoffDate,
                moneda: currency,
                saldo_sistema: Number(systemBalance.toFixed(2)),
                denominaciones: denominationList.map((denomination) => ({
                    denominacion: denomination,
                    cantidad: Number(quantities[denomination] || 0),
                })),
                movimientos_revisados: [...checkedMovementIds],
            });

            setToast({
                title: 'Balanza guardada',
                text: balance.estado === 'cuadrada'
                    ? 'La caja quedó cuadrada correctamente.'
                    : 'La balanza se guardó con diferencia para su seguimiento.',
                type: 'success',
            });
        } catch (error) {
            setToast({ title: 'Aviso', text: error.message, type: 'error' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <Header activePage="balanza" />
            <main className="page-container balance-page">
                <section className="page-header">
                    <div>
                        <h1>Balanza</h1>
                        <p>Comprueba físicamente el saldo de una caja sin modificar sus movimientos.</p>
                    </div>
                </section>

                <section className="card balance-card">
                    <div className="balance-filter-row">
                        <CashBoxSelector label="Caja" />

                        <div className="filter-box">
                            <label htmlFor="balanceCurrency">Moneda</label>
                            <SelectDropdown
                                id="balanceCurrency"
                                value={currency}
                                options={[
                                    { value: 'Pesos', label: 'Pesos' },
                                    { value: 'Dolares', label: 'Dólares' },
                                ]}
                                onChange={(event) => setCurrency(event.target.value)}
                            />
                        </div>

                        <div className="filter-box">
                            <label htmlFor="balanceWeek">Semana</label>
                            <SelectDropdown
                                id="balanceWeek"
                                value={effectiveWeekValue}
                                options={weekOptions.map((weekOption) => ({
                                    value: String(weekOption.week),
                                    label: getWeekLabel(weekOption.year, weekOption.week),
                                }))}
                                onChange={(event) => setSelectedWeekNumber(event.target.value)}
                                disabled={weekOptions.length === 0}
                            />
                        </div>

                        <div className={`balance-status balance-status-${status}`}>
                            <span>Estado de la balanza</span>
                            <strong>{status === 'cuadrada' ? 'Cuadrada' : status === 'faltante' ? 'Faltante' : 'Sobrante'}</strong>
                        </div>
                    </div>

                    <div className="balance-summary-grid">
                        <div className="balance-summary-item">
                            <span>Saldo del sistema</span>
                            <strong>{formatMoneyByCurrency(systemBalance)}</strong>
                        </div>
                        <div className="balance-summary-item">
                            <span>Total contado</span>
                            <strong>{formatMoneyByCurrency(countedTotal)}</strong>
                        </div>
                        <div className={`balance-summary-item balance-difference-${status}`}>
                            <span>Diferencia</span>
                            <strong>{formatDifference(difference)}</strong>
                        </div>
                    </div>

                    {apiError && <div className="inline-error">{apiError}</div>}

                    <div className="balance-content-grid">
                        <section className="balance-denominations-section">
                            <div className="balance-section-heading">
                                <div>
                                    <h2>Conteo por denominaciones</h2>
                                    <p>Indica cuántas piezas encontraste de cada valor.</p>
                                </div>
                                <span className="balance-currency-tag">{isDollarCurrency(currency) ? 'USD' : 'MXN'}</span>
                            </div>

                            <div className="denomination-list">
                                {denominationList.map((denomination) => {
                                    const quantity = Number(quantities[denomination] || 0);
                                    return (
                                        <div className="denomination-row" key={denomination}>
                                            <span className="denomination-value">$ {formatDenomination(denomination)}</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className="filter-control denomination-quantity"
                                                aria-label={`Cantidad de ${formatDenomination(denomination)}`}
                                                value={quantities[denomination] || ''}
                                                onChange={(event) => updateQuantity(denomination, event.target.value)}
                                                placeholder="0"
                                            />
                                            <strong>{formatMoneyByCurrency(denomination * quantity)}</strong>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>

                        <section className="balance-movements-section">
                            <div className="balance-section-heading">
                                <div>
                                    <h2>Movimientos revisados</h2>
                                    <p>Marcar un movimiento solo registra que fue comprobado.</p>
                                </div>
                                <span className="balance-review-count">{checkedMovementIds.size}/{movements.length}</span>
                            </div>

                            <div className="balance-movement-list">
                                {isLoading ? (
                                    <div className="balance-list-empty">Cargando movimientos...</div>
                                ) : movements.length === 0 ? (
                                    <div className="balance-list-empty">No hay movimientos para este corte.</div>
                                ) : movements.map((movement) => (
                                    <label className="balance-movement-row" key={movement.id}>
                                        <input
                                            type="checkbox"
                                            checked={checkedMovementIds.has(movement.id)}
                                            onChange={() => toggleMovement(movement.id)}
                                        />
                                        <span className="balance-movement-main">
                                            <strong>{movement.folio}</strong>
                                            <span>{formatShortDate(movement.fecha)} · {movement.nombre}</span>
                                        </span>
                                        <span className={`balance-movement-amount ${movement.tipo}`}>
                                            {movement.tipo === 'egreso' ? '-' : '+'}{formatMoneyByCurrency(movement.cantidad)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="balance-actions">
                        <p>Los movimientos marcados no cambian el saldo ni se convierten en movimientos nuevos.</p>
                        <button type="button" className="btn btn-dark" onClick={saveBalance} disabled={isLoading || isSaving || !activeCashBoxId}>
                            <span className="material-icons-outlined">save</span>
                            {isSaving ? 'Guardando...' : 'Guardar balanza'}
                        </button>
                    </div>
                </section>
            </main>
            <Toast toast={toast} onClose={() => setToast(null)} />
        </>
    );
}

export default Balances;
