import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/Header.jsx';

import Toast from '../components/ui/Toast.jsx';
import { getCurrentISOWeek, getISOWeekInfo, getMaxAllowedWeekForYear, getTodayISO, getWeekLabel, formatShortDate } from '../utils/dates.js';
import { exportRowsToExcelXml } from '../utils/excel.js';
import { generateAutoFolio } from '../utils/folio.js';
import { printMovementLabel } from '../utils/labelPrint.js';
import {
  CURRENCY_OPTIONS,
  formatMoneyByCurrency,
  getAmountForCurrencyColumn,
  isCurrencySelected,
  isDollarCurrency,
} from '../utils/money.js';
import { isAuthenticated } from '../utils/session.js';

import {
  createMovement,
  getMovements
} from '../services/movementsApi.js';

const modeConfig = {
  ingreso: {
    bodyClass: 'modo-ingreso',
    pillText: 'Ingresos',
    bannerTitle: 'Movimientos de ingreso',
    bannerText: 'Mostrando movimientos de ingreso de la semana seleccionada.',
    previewText: 'Movimiento de ingreso',
    footerText: 'Registro de ingreso',
    icon: 'south_west',
    excelHeaderColor: '#86DFE6'
  },
  egreso: {
    bodyClass: 'modo-egreso',
    pillText: 'Egresos',
    bannerTitle: 'Movimientos de egreso',
    bannerText: 'Mostrando movimientos de egreso de la semana seleccionada.',
    previewText: 'Movimiento de egreso',
    footerText: 'Registro de egreso',
    icon: 'north_east',
    excelHeaderColor: '#F0DC84'
  }
};


// Propósito: limpiar la cantidad escrita por el usuario, permitiendo solo números y un punto decimal.
function normalizeAmountInput(value) {
  const rawValue = String(value ?? '').replace(/,/g, '').replace(/[^0-9.]/g, '');

  if (!rawValue) return '';

  const firstDotIndex = rawValue.indexOf('.');

  if (firstDotIndex === -1) {
    return rawValue.replace(/^0+(?=\d)/, '');
  }

  const integerPart = rawValue
    .slice(0, firstDotIndex)
    .replace(/^0+(?=\d)/, '');

  const decimalPart = rawValue
    .slice(firstDotIndex + 1)
    .replace(/\./g, '')
    .slice(0, 2);

  return `${integerPart || '0'}.${decimalPart}`;
}

// Propósito: mostrar la cantidad con separadores de miles mientras se escribe, sin alterar el valor real guardado.
function formatAmountInputValue(value) {
  const amountText = String(value ?? '');

  if (!amountText) return '';

  const [integerPart, decimalPart] = amountText.split('.');
  const formattedInteger = Number(integerPart || 0).toLocaleString('en-US');

  if (amountText.includes('.')) {
    return `${formattedInteger}.${decimalPart ?? ''}`;
  }

  return formattedInteger;
}

// Propósito: conservar saltos de línea y espacios útiles para conceptos largos o estructurados.
function formatStructuredConcept(value, fallback = 'Descripción breve del movimiento.') {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();

  return text || fallback;
}

function Dashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const labelSheetRef = useRef(null);

  // Registros principales cargados desde PostgreSQL.
  const [records, setRecords] = useState([]);

  // Estados visuales y de operación.
  const initialMovementType = searchParams.get('tipo') === 'egreso' ? 'egreso' : 'ingreso';
  const [type, setType] = useState(initialMovementType);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [apiError, setApiError] = useState('');

  // Filtros del historial.
  const [period, setPeriod] = useState(String(getCurrentISOWeek().year));
  const [week, setWeek] = useState(String(getCurrentISOWeek().week));
  const [folioSearch, setFolioSearch] = useState('');
  const [appliedFolioSearch, setAppliedFolioSearch] = useState('');

  // Notificación y resaltado de registros nuevos.
  const [toast, setToast] = useState(null);
  const [lastCreatedId, setLastCreatedId] = useState(null);

  // Formulario de registro.
  const [form, setForm] = useState({
    fecha: getTodayISO(),
    nombre: '',
    descripcion: '',
    cantidad: '',
    moneda: ''
  });

  const config = modeConfig[type];
  const previewInfo = getISOWeekInfo(form.fecha || getTodayISO());
  const previewConcept = formatStructuredConcept(form.descripcion);

  // Folio automático calculado con los movimientos existentes en PostgreSQL.
  const folio = useMemo(() => {
    return generateAutoFolio(form.fecha, records);
  }, [form.fecha, records]);

  // Periodos visibles: año actual y anterior, igual que el proyecto original.
  const years = useMemo(() => {
    const currentYear = getCurrentISOWeek().year;
    return [currentYear - 1, currentYear];
  }, []);

  // Semanas visibles sin mostrar semanas futuras.
  // Se calculan según el periodo seleccionado y los registros cargados desde PostgreSQL.
  const weeks = useMemo(() => {
    const maxWeek = getMaxAllowedWeekForYear(Number(period), records);

    return Array.from({ length: maxWeek }, (_, index) => maxWeek - index);
  }, [period, records]);

  // Semana seleccionada segura.
  // No usamos useEffect ni setWeek aquí para evitar errores de React Hooks.
  // Si la semana actual ya no existe en el arreglo, usamos la primera disponible.
  const numericSelectedWeek = Number(week);

  const selectedWeek =
    weeks.includes(numericSelectedWeek)
      ? String(numericSelectedWeek)
      : weeks.length > 0
        ? String(weeks[0])
        : '';

  // Registros visibles en la tabla de historial.
  // Filtra por tipo, periodo, semana seleccionada y búsqueda por folio.
  const filteredRows = useMemo(() => {
    return records.filter((record) => {
      const info = getISOWeekInfo(record.fecha);

      const matchBase =
        record.tipo === type &&
        info.year === Number(period) &&
        info.week === Number(selectedWeek);

      const matchFolio =
        appliedFolioSearch === '' ||
        String(record.folio).toLowerCase().includes(appliedFolioSearch);

      return matchBase && matchFolio;
    });
  }, [records, type, period, selectedWeek, appliedFolioSearch]);

  // Calcula el total visible de la semana seleccionada, separado por dólares y pesos.
  const tableTotals = useMemo(() => {
    return filteredRows.reduce(
      (accumulator, record) => {
        const amount = Number(record.cantidad || 0);

        if (isDollarCurrency(record.moneda)) {
          accumulator.dolares += amount;
        } else {
          accumulator.pesos += amount;
        }

        return accumulator;
      },
      {
        dolares: 0,
        pesos: 0
      }
    );
  }, [filteredRows]);

  // Muestra importes de totales; si son cero, muestra --.
  const renderTotalAmount = (amount) => {
    return Number(amount || 0) > 0 ? formatMoneyByCurrency(amount) : '--';
  };

  // Protege la vista y carga movimientos desde la API.
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }

    async function loadMovementsFromApi() {
      try {
        setIsLoading(true);
        setApiError('');

        const data = await getMovements();
        setRecords(data);
      } catch (error) {
        setApiError(error.message);
        setToast({
          title: 'Aviso',
          text: 'No se pudieron cargar los movimientos. Intenta nuevamente.',
          type: 'error'
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadMovementsFromApi();
  }, [navigate]);

  // Aplica las clases del body para respetar los colores de ingreso/egreso.
  useEffect(() => {
    document.body.classList.remove('modo-ingreso', 'modo-egreso', 'login-page', 'pagina-reportes');
    document.body.classList.add('pagina-dashboard', config.bodyClass);

    return () => {
      document.body.classList.remove('pagina-dashboard', config.bodyClass);
    };
  }, [config.bodyClass]);

  // Oculta el toast automáticamente.
  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = setTimeout(() => {
      setToast(null);
    }, 2600);

    return () => clearTimeout(timeoutId);
  }, [toast]);

  // Limpia el resaltado de fila después de unos segundos.
  useEffect(() => {
    if (!lastCreatedId) return undefined;

    const timeoutId = setTimeout(() => {
      setLastCreatedId(null);
    }, 1600);

    return () => clearTimeout(timeoutId);
  }, [lastCreatedId]);

  // Actualiza un campo del formulario.
  const updateForm = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  // Limpia el formulario y deja valores base.
  const clearForm = () => {
    setForm({
      fecha: getTodayISO(),
      nombre: '',
      descripcion: '',
      cantidad: '',
      moneda: ''
    });
  };

  // Cambia entre ingresos y egresos desde el menú superior.
  const selectMovementType = (nextType) => {
    setType(nextType);
  };

  // Guarda un movimiento usando el backend Express/PostgreSQL.
  const saveMovement = async () => {
    if (
      !form.fecha ||
      !folio ||
      !form.nombre.trim() ||
      !form.descripcion.trim() ||
      Number(form.cantidad) <= 0 ||
      !form.moneda
    ) {
      setToast({
        title: 'Aviso',
        text: 'Completa todos los campos y selecciona una moneda.',
        type: 'error'
      });
      return;
    }

    const newRecord = {
      tipo: type,
      fecha: form.fecha,
      folio,
      nombre: form.nombre.trim(),
      descripcion: form.descripcion.trim(),
      cantidad: Number(form.cantidad),
      moneda: form.moneda
    };

    try {
      setIsSaving(true);

      const savedRecord = await createMovement(newRecord);

      setRecords((currentRecords) => [savedRecord, ...currentRecords]);
      setLastCreatedId(savedRecord.id);

      const info = getISOWeekInfo(savedRecord.fecha);
      setPeriod(String(info.year));
      setWeek(String(info.week));
      setFolioSearch('');
      setAppliedFolioSearch('');

      setToast({
        title: `${type === 'ingreso' ? 'Ingreso' : 'Egreso'} guardado exitosamente`,
        text: 'Movimiento guardado.',
        type: 'success'
      });

      // Propósito: imprimir únicamente la etiqueta en una ventana limpia para evitar hojas extra.
      printMovementLabel(savedRecord, {
        onPopupBlocked: () => {
          setToast({
            title: 'Aviso',
            text: 'No se pudo abrir la impresión. Permite las ventanas emergentes e intenta de nuevo.',
            type: 'error'
          });
        },
        onAfterPrint: clearForm,
      });
    } catch (error) {
      setToast({
        title: 'Aviso',
        text: error.message,
        type: 'error'
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Exporta los registros visibles de la semana seleccionada.
  const exportVisibleWeekToExcel = () => {
    if (!filteredRows.length) {
      setToast({
        title: 'Aviso',
        text: 'No hay movimientos para exportar en la semana seleccionada.',
        type: 'error'
      });
      return;
    }

    const excelRows = filteredRows.map((record) => {
      const info = getISOWeekInfo(record.fecha);

      return [
        info.week,
        record.folio,
        formatShortDate(record.fecha),
        record.nombre,
        record.descripcion,
        isDollarCurrency(record.moneda) ? formatMoneyByCurrency(record.cantidad, 'Dólares') : '',
        isDollarCurrency(record.moneda) ? '' : formatMoneyByCurrency(record.cantidad, 'Pesos')
      ];
    });

    exportRowsToExcelXml({
      rows: excelRows,
      sheetName: `Semana_${selectedWeek}`,
      fileName: `movimientos_${config.pillText.toLowerCase()}_${period}_semana_${selectedWeek}`,
      headers: ['Sem', 'Folio', 'Fecha', 'Nombre', 'Concepto', 'Dólares', 'Pesos'],
      headerColor: config.excelHeaderColor
    });

    setToast({
      title: 'Exportación completada',
      text: 'Tabla exportada.',
      type: 'success'
    });
  };


  return (
    <>
      <Header
        activePage="movimientos"
        movementType={type}
        onMovementTypeChange={selectMovementType}
      />

      <main className="page-wrapper">
        <section className="page-header screenshot-style-header">
          <div>
            <h1>Movimientos</h1>
            <p>Consulta y registra movimientos por semana.</p>
          </div>
        </section>

        <section className="mode-banner">
          <div className="mode-banner-icon">
            <span className="material-icons-outlined">{config.icon}</span>
          </div>

          <div className="mode-banner-content">
            <strong>{config.bannerTitle}</strong>
            <p>{config.bannerText}</p>
          </div>
        </section>

        <section className="main-grid">
          <div className="card form-card">
            <div className="card-header">
              <h2>Formulario de movimiento</h2>
              <span className="mode-pill">{config.pillText}</span>
            </div>

            <form className="label-form" autoComplete="off">
              <div className="form-grid one-column">
                <div className="form-group">
                  <label htmlFor="fechaMovimiento">Fecha</label>
                  <input
                    type="date"
                    id="fechaMovimiento"
                    value={form.fecha}
                    max={getTodayISO()}
                    onChange={(event) => updateForm('fecha', event.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="folio">Folio</label>
                  <input type="text" id="folio" value={folio} readOnly />
                </div>

                <div className="form-group">
                  <label htmlFor="nombre">Nombre</label>
                  <input
                    type="text"
                    id="nombre"
                    placeholder="Nombre del movimiento"
                    value={form.nombre}
                    onChange={(event) => updateForm('nombre', event.target.value)}
                  />
                </div>

                <div className="form-group concept-form-group">
                  <label htmlFor="descripcion">Concepto</label>
                  <textarea
                    id="descripcion"
                    className="structured-concept-input"
                    rows="7"
                    placeholder={`Escribe el concepto con el formato que necesites. Ejemplo:
Pago de 2 carretas
Cliente: Ramón
Detalle: Zoto / Ramón`}
                    value={form.descripcion}
                    onChange={(event) => updateForm('descripcion', event.target.value)}
                  />
                  <small className="field-helper">
                    Puedes usar Enter para separar líneas; el ticket respetará ese formato.
                  </small>
                </div>

                <div className="form-group">
                  <label htmlFor="cantidad">Cantidad</label>
                  <input
                    type="text"
                    id="cantidad"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={formatAmountInputValue(form.cantidad)}
                    onChange={(event) => updateForm('cantidad', normalizeAmountInput(event.target.value))}
                  />
                </div>

                <div className="form-group currency-action-group">
                  <label>Moneda *</label>

                  <div className="currency-choice-group dashboard-currency-row" role="radiogroup" aria-label="Seleccionar moneda">
                    {CURRENCY_OPTIONS.map((currency) => (
                      <button
                        key={currency.value}
                        type="button"
                        className={`currency-choice compact ${isCurrencySelected(form.moneda, currency.value) ? 'selected' : ''}`}
                        onClick={() => updateForm('moneda', currency.value)}
                        aria-pressed={isCurrencySelected(form.moneda, currency.value)}
                      >
                        <span className="currency-choice-symbol">{currency.symbol}</span>
                        <span className="currency-choice-text">
                          <strong>{currency.label}</strong>
                          <small>{currency.helper}</small>
                        </span>
                        <span className="material-icons-outlined currency-choice-check">check_circle</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-actions dashboard-form-actions">
                  <button type="button" className="btn btn-light" onClick={clearForm}>
                    <span className="material-icons-outlined">cleaning_services</span>
                    Limpiar
                  </button>

                  <button
                    type="button"
                    className="btn btn-dark"
                    onClick={saveMovement}
                    disabled={isSaving}
                  >
                    <span className="material-icons-outlined">save</span>
                    {isSaving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          <div className="card preview-card thermal-preview-card">
            <div className="card-header">
              <h2>Vista previa real del ticket</h2>
              <span className="mode-pill">58 mm</span>
            </div>

            <div className="thermal-preview-stage">
              <div className="thermal-preview-size-note">
                <span className="material-icons-outlined">receipt_long</span>
                Vista aproximada del ticket térmico real antes de guardar
              </div>

              {/* Propósito: mostrar en Movimientos el recibo con las mismas dimensiones y estructura del ticket impreso. */}
              <div className="thermal-print-page" aria-label="Vista previa del ticket térmico">
                <section className="thermal-label-sheet" ref={labelSheetRef}>
                  <div className="thermal-label-top">
                    <div className="thermal-label-brand">
                      <div>
                        <h3>Oficinas TJ</h3>
                      </div>
                    </div>
                  </div>

                  <div className="thermal-label-body">
                    <div className="thermal-label-line">
                      <strong>Folio:</strong> <span>{folio || '00000000'}</span>
                    </div>

                    <div className="thermal-label-line">
                      <strong>Fecha:</strong> <span>{formatShortDate(form.fecha || getTodayISO())}</span>
                    </div>

                    <div className="thermal-label-line">
                      <strong>Semana:</strong> <span>{previewInfo.week}</span>
                    </div>

                    <div className="thermal-label-line thermal-label-line-stacked">
                      <strong>Nombre:</strong>
                      <span>{form.nombre.trim() || 'Movimiento de muestra'}</span>
                    </div>

                    <div className="thermal-label-line thermal-label-line-stacked thermal-label-line-concept">
                      <strong>Concepto:</strong>
                      <span className="thermal-structured-text">{previewConcept}</span>
                    </div>

                    <div className="thermal-label-line">
                      <strong>Monto:</strong> <span>{formatMoneyByCurrency(form.cantidad || 0, form.moneda)}</span>
                    </div>

                    <div className="thermal-label-line">
                      <strong>Moneda:</strong> <span>{isDollarCurrency(form.moneda) ? 'Dólares' : form.moneda || 'Sin seleccionar'}</span>
                    </div>
                  </div>

                  <div className="thermal-label-footer">
                    <div className="thermal-signature-area">
                      <div className="thermal-signature-line"></div>
                      <div className="thermal-signature-label">Firma de recibido</div>
                    </div>

                    <div className="thermal-print-note">{config.footerText}</div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        </section>

        <section className="card history-card">
          <div className="card-header">
            <h2>Registros de la semana {selectedWeek}</h2>
            <span className="mode-pill">{config.pillText}</span>
          </div>

          <div className="history-toolbar">
            <div className="history-filter-grid">
              <div className="filter-box filter-small">
                <label htmlFor="periodoSelect">Periodo</label>
                <select
                  id="periodoSelect"
                  className="filter-control"
                  value={period}
                  onChange={(event) => setPeriod(event.target.value)}
                >
                  {years.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="filter-box filter-large">
                <label htmlFor="semanaSelect">A la semana</label>
                {/* Selector de semana del historial */}
                <select
                  id="semanaSelect"
                  className="filter-control"
                  value={selectedWeek}
                  onChange={(event) => setWeek(event.target.value)}
                >
                  {weeks.map((itemWeek) => (
                    <option key={itemWeek} value={itemWeek}>
                      {getWeekLabel(Number(period), itemWeek)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="filter-box filter-search">
                <label htmlFor="searchFolio">Buscar folio</label>
                <div className="search-inline">
                  <input
                    type="text"
                    id="searchFolio"
                    className="filter-control search-control"
                    placeholder="Buscar folio y Enter"
                    value={folioSearch}
                    onChange={(event) => setFolioSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        setAppliedFolioSearch(folioSearch.trim().toLowerCase());
                      }
                    }}
                  />

                  <button
                    type="button"
                    className="clear-search-btn"
                    aria-label="Limpiar búsqueda"
                    onClick={() => {
                      setFolioSearch('');
                      setAppliedFolioSearch('');
                    }}
                  >
                    <span className="material-icons-outlined">close</span>
                  </button>
                </div>
              </div>

              <div className="filter-box filter-export">
                <label>&nbsp;</label>
                <button type="button" className="btn btn-export" onClick={exportVisibleWeekToExcel}>
                  <span className="material-icons-outlined">download</span>
                  Exportar
                </button>
              </div>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Sem</th>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Concepto</th>
                  <th>Dólares</th>
                  <th>Pesos</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '18px' }}>
                      Cargando movimientos...
                    </td>
                  </tr>
                ) : apiError ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '18px' }}>
                      {apiError}
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '18px' }}>
                      No se encontraron registros para los filtros actuales.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((record) => {
                    const info = getISOWeekInfo(record.fecha);

                    return (
                      <tr
                        key={record.id}
                        className={record.id === lastCreatedId ? 'row-highlight' : ''}
                      >
                        <td>{info.week}</td>
                        <td>{record.folio}</td>
                        <td>{formatShortDate(record.fecha)}</td>
                        <td>{record.nombre}</td>
                        <td className="concept-cell">{record.descripcion}</td>
                        <td className="money-cell">{getAmountForCurrencyColumn(record, 'Dólares')}</td>
                        <td className="money-cell">{getAmountForCurrencyColumn(record, 'Pesos')}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {!isLoading && !apiError && filteredRows.length > 0 && (
                <tfoot>
                  <tr className="history-total-row">
                    <td colSpan="5" className="total-week-label">Total de la semana</td>
                    <td className="money-cell">{renderTotalAmount(tableTotals.dolares)}</td>
                    <td className="money-cell">{renderTotalAmount(tableTotals.pesos)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      </main>

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export default Dashboard;
