// Archivo: src/pages/Reports.jsx
// Propósito: vista reutilizable para reportes de ingresos, egresos o cancelados con edición, cancelación lógica e historial de ajustes.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header.jsx';
import {
  deleteMovement,
  getMovementEditHistory,
  getMovements,
  updateMovement,
} from '../services/movementsApi.js';

import Toast from '../components/ui/Toast.jsx';
import { getCurrentISOWeek, getISOWeekInfo, getMaxAllowedWeekForYear, getWeekLabel, formatShortDate } from '../utils/dates.js';
import { exportRowsToExcelXml } from '../utils/excel.js';
import { printMovementLabel } from '../utils/labelPrint.js';
import {
  CURRENCY_OPTIONS,
  formatMoneyByCurrency,
  getAmountForCurrencyColumn,
  isCurrencySelected,
  isDollarCurrency,
  normalizeCurrencyName,
} from '../utils/money.js';
import { isAuthenticated } from '../utils/session.js';

// Propósito: revisar si el movimiento tiene una edición guardada en movement_edits.
function hasAmountAdjustment(record) {
  return Boolean(record.ultimo_ajuste_id && record.fecha_ultima_edicion);
}

// Propósito: calcular la diferencia del último ajuste registrado.
function getAdjustmentDifference(record) {
  if (!hasAmountAdjustment(record)) {
    return '—';
  }

  const currentAmount = Number(record.cantidad_nueva || 0);
  const previousAmount = Number(record.cantidad_anterior || 0);
  const difference = currentAmount - previousAmount;
  const sign = difference >= 0 ? '+' : '-';

  return `${sign}${formatMoneyByCurrency(Math.abs(difference), record.moneda_nueva)}`;
}

// Propósito: normalizar valores para comparar si un campo cambió.
function normalizeAdjustmentValue(value) {
  return String(value ?? '').trim();
}

// Propósito: limpiar la cantidad escrita en el modal, conservando solo números y un punto decimal.
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

// Propósito: mostrar separadores de miles en el campo de cantidad sin alterar el valor real guardado.
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

// Propósito: mostrar etiquetas legibles para tipo de movimiento.
function getTypeLabel(type) {
  if (type === 'egreso') return 'Egreso';
  if (type === 'cancelado') return 'Cancelado';
  return 'Ingreso';
}

// Propósito: obtener el valor anterior guardado para un campo del último ajuste.
function getPreviousFieldValue(record, fieldName) {
  return record?.[`${fieldName}_anterior`] ?? '';
}

// Propósito: obtener el valor nuevo guardado para un campo del último ajuste.
function getNewFieldValue(record, fieldName) {
  return record?.[`${fieldName}_nuevo`] ?? record?.[fieldName] ?? '';
}

// Propósito: identificar si un campo específico cambió en el último ajuste.
function fieldChangedInLastAdjustment(record, fieldName) {
  if (!hasAmountAdjustment(record)) return false;

  const previousValue = getPreviousFieldValue(record, fieldName);
  const newValue = getNewFieldValue(record, fieldName);

  if (previousValue === '' || newValue === '') return false;

  return normalizeAdjustmentValue(previousValue) !== normalizeAdjustmentValue(newValue);
}

// Propósito: identificar si el monto o la moneda cambió en el último ajuste.
function moneyChangedInLastAdjustment(record) {
  if (!hasAmountAdjustment(record)) return false;

  const previousAmount = Number(record.cantidad_anterior || 0);
  const newAmount = Number(record.cantidad_nueva || 0);
  const previousCurrency = normalizeCurrencyName(record.moneda_anterior);
  const newCurrency = normalizeCurrencyName(record.moneda_nueva);

  return previousAmount !== newAmount || previousCurrency !== newCurrency;
}



// Propósito: formatear fecha y hora de edición para mostrarla en el historial.
function formatEditDateTime(dateValue) {
  if (!dateValue) return 'Sin fecha';

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return String(dateValue);
  }

  return date.toLocaleString('es-MX', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const REPORT_SECTIONS = {
  ingreso: {
    title: 'Reporte de Ingresos',
    plural: 'Ingresos',
    singular: 'ingreso',
    description: 'Consulta, modifica, cancela y exporta únicamente los ingresos.',
    icon: 'south_west',
    headerColor: '#86DFE6',
    fileName: 'reporte_ingresos',
    sheetName: 'Ingresos'
  },
  egreso: {
    title: 'Reporte de Egresos',
    plural: 'Egresos',
    singular: 'egreso',
    description: 'Consulta, modifica, cancela y exporta únicamente los egresos.',
    icon: 'north_east',
    headerColor: '#F0DC84',
    fileName: 'reporte_egresos',
    sheetName: 'Egresos'
  },
  cancelado: {
    title: 'Reporte de Historial',
    plural: 'Historial',
    singular: 'historial',
    description: 'Consulta movimientos cancelados y cambios realizados.',
    icon: 'block',
    headerColor: '#FCA5A5',
    fileName: 'reporte_historial',
    sheetName: 'Historial'
  }
};

function getSafeReportType(value) {
  if (value === 'egreso' || value === 'cancelado') return value;
  return 'ingreso';
}

function Reports({ reportType = 'ingreso' }) {
  const navigate = useNavigate();

  // Propósito: tipo de reporte que viene desde la ruta.
  const activeReportType = getSafeReportType(reportType);

  // Propósito: registros principales cargados.
  const [records, setRecords] = useState([]);

  // Propósito: estados de carga, errores y notificaciones.
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [apiError, setApiError] = useState('');
  const [toast, setToast] = useState(null);

  // Propósito: estado del modal de edición.
  const [editingRecord, setEditingRecord] = useState(null);
  const [editForm, setEditForm] = useState({
    tipo: 'ingreso',
    fecha: '',
    folio: '',
    nombre: '',
    descripcion: '',
    cantidad: '',
    moneda: '',
    comentario: ''
  });

  // Propósito: estado del modal que muestra el último ajuste de monto.
  const [selectedAdjustmentRecord, setSelectedAdjustmentRecord] = useState(null);

  // Propósito: movimiento pendiente de confirmación antes de cancelar.
  const [cancelCandidate, setCancelCandidate] = useState(null);

  // Propósito: historial completo de ajustes, visible en Reportes > Cancelados.
  const [editHistoryRows, setEditHistoryRows] = useState([]);
  const [isEditHistoryLoading, setIsEditHistoryLoading] = useState(false);
  const [editHistoryError, setEditHistoryError] = useState('');

  // Propósito: filtros de reportes.
  const [period, setPeriod] = useState(String(getCurrentISOWeek().year));
  const [week, setWeek] = useState('todas');
  const [date, setDate] = useState('');
  const [folio, setFolio] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('todos');
  const [amount, setAmount] = useState('');

  // Propósito: filtros aplicados al presionar Buscar.
  const [appliedFilters, setAppliedFilters] = useState({
    period: String(getCurrentISOWeek().year),
    week: 'todas',
    date: '',
    folio: '',
    name: '',
    description: '',
    currency: 'todos',
    amount: ''
  });

  const activeSection = REPORT_SECTIONS[activeReportType];
  const isCanceledReport = activeReportType === 'cancelado';

  // Propósito: periodos visibles: año actual y anterior.
  const years = useMemo(() => {
    const currentYear = getCurrentISOWeek().year;
    return [currentYear - 1, currentYear];
  }, []);

  // Propósito: semanas visibles para el periodo seleccionado.
  const weeks = useMemo(() => {
    const maxWeek = getMaxAllowedWeekForYear(Number(period), records);
    return Array.from({ length: maxWeek }, (_, index) => maxWeek - index);
  }, [period, records]);

  // Propósito: semana válida sin usar setState dentro de useEffect.
  const selectedReportWeek =
    week === 'todas' || weeks.includes(Number(week))
      ? week
      : 'todas';

  // Propósito: registros visibles en la tabla según sección activa y filtros aplicados.
  const filteredRows = useMemo(() => {
    return records.filter((record) => {
      const info = getISOWeekInfo(record.fecha);
      const filterYear = Number(appliedFilters.period);
      const filterWeek = appliedFilters.week;
      const filterDate = appliedFilters.date.trim();
      const filterFolio = appliedFilters.folio.trim().toLowerCase();
      const filterName = appliedFilters.name.trim().toLowerCase();
      const filterDescription = appliedFilters.description.trim().toLowerCase();
      const filterCurrency = appliedFilters.currency;
      const filterAmount = appliedFilters.amount.trim();

      // Propósito: cada apartado muestra su tipo actual.
      // Si se acaba de cancelar desde ingresos/egresos, se conserva visible temporalmente
      // en la vista actual para que el usuario vea la fila pintada en rojo.
      const shouldKeepRecentlyCanceledVisible =
        record.tipo === 'cancelado' &&
        record.__justCanceled === true &&
        record.__previousReportType === activeReportType;

      if (record.tipo !== activeReportType && !shouldKeepRecentlyCanceledVisible) {
        return false;
      }

      if (info.year !== filterYear) return false;

      if (filterWeek !== 'todas' && info.week !== Number(filterWeek)) {
        return false;
      }

      if (filterDate !== '' && record.fecha !== filterDate) return false;

      if (
        filterFolio !== '' &&
        !String(record.folio).toLowerCase().includes(filterFolio)
      ) {
        return false;
      }

      if (
        filterName !== '' &&
        !String(record.nombre).toLowerCase().includes(filterName)
      ) {
        return false;
      }

      if (
        filterDescription !== '' &&
        !String(record.descripcion).toLowerCase().includes(filterDescription)
      ) {
        return false;
      }

      if (
        filterCurrency !== 'todos' &&
        normalizeCurrencyName(record.moneda) !== normalizeCurrencyName(filterCurrency)
      ) {
        return false;
      }

      if (filterAmount !== '' && Number(record.cantidad) !== Number(filterAmount)) {
        return false;
      }

      return true;
    });
  }, [records, appliedFilters, activeReportType]);

  // Propósito: calcular totales de la tabla visible sin considerar movimientos cancelados.
  const reportTableTotals = useMemo(() => {
    return filteredRows.reduce(
      (accumulator, record) => {
        if (record.tipo === 'cancelado') {
          return accumulator;
        }

        const amountValue = Number(record.cantidad || 0);

        if (isDollarCurrency(record.moneda)) {
          accumulator.dolares += amountValue;
        } else {
          accumulator.pesos += amountValue;
        }

        return accumulator;
      },
      {
        dolares: 0,
        pesos: 0
      }
    );
  }, [filteredRows]);

  // Propósito: mostrar totales con formato de dinero o -- cuando el total sea cero.
  const renderReportTotalAmount = (amountValue) => {
    return Number(amountValue || 0) > 0 ? formatMoneyByCurrency(amountValue) : '--';
  };

  // Propósito: proteger la vista y cargar reportes.
  useEffect(() => {
    if (!isAuthenticated()) {
      navigate('/login', { replace: true });
      return;
    }

    async function loadReportsFromApi() {
      try {
        setIsLoading(true);
        setApiError('');

        const data = await getMovements();
        setRecords(data);
      } catch (error) {
        setApiError(error.message);
        setToast({
          title: 'Aviso',
          text: 'No se pudieron cargar los reportes. Intenta nuevamente.',
          type: 'error'
        });
      } finally {
        setIsLoading(false);
      }
    }

    loadReportsFromApi();
  }, [navigate, activeReportType]);

  // Propósito: cargar el historial completo de ajustes cuando se abre Reportes > Cancelados.
  useEffect(() => {
    if (!isAuthenticated()) return;

    if (!isCanceledReport) {
      return;
    }

    async function loadCanceledEditHistory() {
      try {
        setIsEditHistoryLoading(true);
        setEditHistoryError('');

        // Propósito: mostrar en este apartado todo el historial de ediciones existente,
        // no solo el de movimientos que ya fueron cancelados.
        const data = await getMovementEditHistory();
        setEditHistoryRows(data);
      } catch (error) {
        setEditHistoryRows([]);
        setEditHistoryError(error.message);
      } finally {
        setIsEditHistoryLoading(false);
      }
    }

    loadCanceledEditHistory();
  }, [isCanceledReport]);

  // Propósito: aplicar clases generales del body y cambiar color base según sección activa.
  useEffect(() => {
    document.body.classList.remove('login-page', 'modo-ingreso', 'modo-egreso', 'modo-cancelado');
    document.body.classList.add(
      'pagina-dashboard',
      'pagina-reportes',
      activeReportType === 'egreso'
        ? 'modo-egreso'
        : activeReportType === 'cancelado'
          ? 'modo-cancelado'
          : 'modo-ingreso'
    );

    return () => {
      document.body.classList.remove(
        'pagina-dashboard',
        'pagina-reportes',
        'modo-ingreso',
        'modo-egreso',
        'modo-cancelado'
      );
    };
  }, [activeReportType]);

  // Propósito: ocultar el toast automáticamente.
  useEffect(() => {
    if (!toast) return undefined;

    const timeoutId = setTimeout(() => {
      setToast(null);
    }, 2600);

    return () => clearTimeout(timeoutId);
  }, [toast]);

  // Propósito: actualizar un campo del formulario de edición.
  const updateEditForm = (field, value) => {
    setEditForm((current) => ({
      ...current,
      [field]: value
    }));
  };

  // Propósito: abrir el modal cargando los datos del movimiento seleccionado.
  const openEditModal = (record) => {
    setEditingRecord(record);
    setEditForm({
      tipo: record.tipo,
      fecha: record.fecha,
      folio: record.folio,
      nombre: record.nombre,
      descripcion: record.descripcion,
      cantidad: String(record.cantidad),
      moneda: record.moneda,
      comentario: ''
    });
  };

  // Propósito: cerrar el modal de edición sin modificar el registro.
  const closeEditModal = () => {
    if (isUpdating) return;

    setEditingRecord(null);
    setEditForm({
      tipo: 'ingreso',
      fecha: '',
      folio: '',
      nombre: '',
      descripcion: '',
      cantidad: '',
      moneda: '',
      comentario: ''
    });
  };

  // Propósito: cerrar el modal de detalle del ajuste.
  const closeAdjustmentModal = () => {
    setSelectedAdjustmentRecord(null);
  };

  // Propósito: guardar la edición del movimiento seleccionado.
  const saveEditedMovement = async (event) => {
    event.preventDefault();

    if (
      !editForm.tipo ||
      !editForm.fecha ||
      !editForm.folio.trim() ||
      !editForm.nombre.trim() ||
      !editForm.descripcion.trim() ||
      Number(editForm.cantidad) <= 0 ||
      !editForm.moneda ||
      !editForm.comentario.trim()
    ) {
      setToast({
        title: 'Aviso',
        text: 'Completa todos los campos y escribe el motivo del cambio.',
        type: 'error'
      });
      return;
    }

    if (!editingRecord) return;

    const updatedPayload = {
      tipo: editForm.tipo,
      fecha: editForm.fecha,
      folio: editForm.folio.trim(),
      nombre: editForm.nombre.trim(),
      descripcion: editForm.descripcion.trim(),
      cantidad: Number(editForm.cantidad),
      moneda: editForm.moneda,
      comentario: editForm.comentario.trim()
    };

    try {
      setIsUpdating(true);

      const updatedRecord = await updateMovement(editingRecord.id, updatedPayload);

      // Propósito: reemplazar en pantalla el registro actualizado con su último ajuste.
      setRecords((currentRecords) =>
        currentRecords.map((record) =>
          record.id === updatedRecord.id ? updatedRecord : record
        )
      );

      setToast({
        title: 'Movimiento actualizado',
        text: hasAmountAdjustment(updatedRecord)
          ? 'Cambios guardados. El ajuste quedó registrado.'
          : 'Cambios guardados.',
        type: 'success'
      });

      closeEditModal();
    } catch (error) {
      setToast({
        title: 'Aviso',
        text: error.message,
        type: 'error'
      });
    } finally {
      setIsUpdating(false);
    }
  };

  // Propósito: abrir un modal formal antes de cancelar el movimiento seleccionado.
  const openCancelModal = (record) => {
    if (!record || deletingId) return;

    setCancelCandidate(record);
  };

  // Propósito: cerrar el modal de cancelación sin modificar el movimiento.
  const closeCancelModal = () => {
    if (deletingId) return;

    setCancelCandidate(null);
  };

  // Propósito: cancelar el movimiento después de confirmar desde el modal.
  const confirmCancelMovement = async () => {
    if (!cancelCandidate) return;

    const record = cancelCandidate;

    try {
      setDeletingId(record.id);

      const canceledRecord = await deleteMovement(record.id);

      // Propósito: marcarlo como cancelado y dejarlo visible temporalmente en rojo.
      // Al recargar o cambiar de pestaña, desaparecerá de ingresos/egresos porque ya será tipo = cancelado.
      setRecords((currentRecords) =>
        currentRecords.map((currentRecord) =>
          currentRecord.id === record.id
            ? {
                ...currentRecord,
                ...canceledRecord,
                __justCanceled: activeReportType !== 'cancelado',
                __previousReportType: currentRecord.tipo,
              }
            : currentRecord
        )
      );

      setToast({
        title: 'Movimiento cancelado',
        text: 'Movimiento cancelado. Se marcará en rojo por un momento y después aparecerá en Historial.',
        type: 'success'
      });

      setCancelCandidate(null);
    } catch (error) {
      setToast({
        title: 'Aviso',
        text: error.message,
        type: 'error'
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Propósito: imprimir desde Reportes usando el mismo formato de etiqueta que se usa al guardar en Movimientos.
  const printMovement = (record) => {
    printMovementLabel(record, {
      onPopupBlocked: () => {
        setToast({
          title: 'Aviso',
          text: 'No se pudo abrir la impresión. Permite las ventanas emergentes e intenta de nuevo.',
          type: 'error'
        });
      },
    });
  };

  // Propósito: aplicar los filtros actuales al listado.
  const applyFilters = () => {
    setAppliedFilters({
      period,
      week: selectedReportWeek,
      date,
      folio,
      name,
      description,
      currency,
      amount
    });
  };

  // Propósito: limpiar los filtros y volver a los valores base sin cambiar de apartado.
  const clearFilters = () => {
    const currentYear = String(getCurrentISOWeek().year);

    setPeriod(currentYear);
    setWeek('todas');
    setDate('');
    setFolio('');
    setName('');
    setDescription('');
    setCurrency('todos');
    setAmount('');

    setAppliedFilters({
      period: currentYear,
      week: 'todas',
      date: '',
      folio: '',
      name: '',
      description: '',
      currency: 'todos',
      amount: ''
    });
  };

  // Propósito: exportar el reporte filtrado actual de la sección activa.
  const exportReportTable = () => {
    if (!filteredRows.length) {
      setToast({
        title: 'Aviso',
        text: `No hay ${activeSection.plural.toLowerCase()} para exportar con los filtros actuales.`,
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
      sheetName: activeSection.sheetName,
      fileName: activeSection.fileName,
      headers: ['Sem', 'Folio', 'Fecha', 'Nombre', 'Concepto', 'Dólares', 'Pesos'],
      headerColor: activeSection.headerColor
    });

    setToast({
      title: 'Exportación completada',
      text: `Reporte de ${activeSection.plural.toLowerCase()} exportado.`,
      type: 'success'
    });
  };

  // Propósito: cantidad de columnas visibles en la tabla principal.
  const mainTableColSpan = 8;

  return (
    <>
      <Header activePage="reportes" reportType={activeReportType} />

      <main className="page-wrapper">
        <section className="page-header screenshot-style-header">
          <div>
            <h1>{activeSection.title}</h1>
            <p>{activeSection.description}</p>
          </div>
        </section>

        <section className="card reports-card">
          <div className="card-header reports-header-row">
            <div>
              <h2>Detalle de {activeSection.plural}</h2>
              <p className="report-section-description">Solo se muestran {activeSection.plural.toLowerCase()}.</p>
            </div>

            <div className="reports-header-actions">
              <button type="button" className="btn btn-secondary" onClick={clearFilters}>
                <span className="material-icons-outlined">refresh</span>
                Limpiar
              </button>

              <button type="button" className="btn btn-export" onClick={exportReportTable}>
                <span className="material-icons-outlined">download</span>
                Exportar
              </button>
            </div>
          </div>

          <div className="reports-filters-strip reports-filters-separated">
            <div className="filter-box">
              <label htmlFor="reportPeriodo">Periodo</label>
              <select
                id="reportPeriodo"
                className="filter-control"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-box">
              <label htmlFor="reportSemana">Semana</label>
              <select
                id="reportSemana"
                className="filter-control"
                value={selectedReportWeek}
                onChange={(event) => setWeek(event.target.value)}
              >
                <option value="todas">Todas</option>

                {weeks.map((itemWeek) => (
                  <option key={itemWeek} value={String(itemWeek)}>
                    {getWeekLabel(Number(period), itemWeek)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-box">
              <label htmlFor="reportFecha">Fecha</label>
              <input
                type="date"
                id="reportFecha"
                className="filter-control"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>

            <div className="filter-box">
              <label htmlFor="reportFolio">Folio</label>
              <input
                type="text"
                id="reportFolio"
                className="filter-control"
                placeholder="Ej. 26041301"
                value={folio}
                onChange={(event) => setFolio(event.target.value)}
              />
            </div>

            <div className="filter-box">
              <label htmlFor="reportNombre">Nombre</label>
              <input
                type="text"
                id="reportNombre"
                className="filter-control"
                placeholder="Buscar nombre"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <div className="filter-box filter-wide">
              <label htmlFor="reportDescripcion">Concepto</label>
              <input
                type="text"
                id="reportDescripcion"
                className="filter-control"
                placeholder="Buscar concepto"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="filter-box">
              <label htmlFor="reportMoneda">Moneda</label>
              <select
                id="reportMoneda"
                className="filter-control"
                value={currency}
                onChange={(event) => setCurrency(event.target.value)}
              >
                <option value="todos">Todas</option>
                <option value="Dolares">Dólares</option>
                <option value="Pesos">Pesos</option>
              </select>
            </div>

            <div className="filter-box">
              <label htmlFor="reportCantidad">Cantidad</label>
              <input
                type="number"
                id="reportCantidad"
                className="filter-control"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>

            <div className="filter-box report-filter-button-box">
              <label>&nbsp;</label>
              <button type="button" className="btn btn-dark" onClick={applyFilters}>
                <span className="material-icons-outlined">search</span>
                Buscar
              </button>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="history-table report-table">
              <thead>
                <tr>
                  <th>Sem</th>
                  <th>Folio</th>
                  <th>Fecha</th>
                  <th>Nombre</th>
                  <th>Concepto</th>
                  <th>Dólares</th>
                  <th>Pesos</th>
                  <th className="report-actions-header">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={mainTableColSpan} style={{ textAlign: 'center', padding: '18px' }}>
                      Cargando {activeSection.plural.toLowerCase()}...
                    </td>
                  </tr>
                ) : apiError ? (
                  <tr>
                    <td colSpan={mainTableColSpan} style={{ textAlign: 'center', padding: '18px' }}>
                      {apiError}
                    </td>
                  </tr>
                ) : filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={mainTableColSpan} style={{ textAlign: 'center', padding: '18px' }}>
                      No hay {activeSection.plural.toLowerCase()} con los filtros seleccionados.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((record) => {
                    const info = getISOWeekInfo(record.fecha);
                    const isDeletingCurrentRow = deletingId === record.id;
                    const isCanceledRow = record.tipo === 'cancelado';
                    const rowClassName = [
                      isCanceledRow ? 'report-row-cancelado' : '',
                      hasAmountAdjustment(record) ? 'report-row-edited' : ''
                    ].filter(Boolean).join(' ');

                    return (
                      <tr key={record.id} className={rowClassName}>
                        <td>{info.week}</td>
                        <td>{record.folio}</td>
                        <td>{formatShortDate(record.fecha)}</td>
                        <td>{record.nombre}</td>
                        <td className="concept-cell">{record.descripcion}</td>
                        <td className="money-cell">{getAmountForCurrencyColumn(record, 'Dólares')}</td>
                        <td className="money-cell">{getAmountForCurrencyColumn(record, 'Pesos')}</td>
                        <td className="report-actions-cell">
                          <div className="report-row-actions" aria-label="Acciones del movimiento">
                            <>
                                <button
                                  type="button"
                                  className="btn-icon-action btn-edit-row"
                                  onClick={() => openEditModal(record)}
                                  disabled={Boolean(deletingId) || record.tipo === 'cancelado'}
                                  title="Editar movimiento"
                                  aria-label="Editar movimiento"
                                >
                                  <span className="material-icons-outlined">edit</span>
                                </button>

                                <button
                                  type="button"
                                  className="btn-icon-action btn-print-row"
                                  onClick={() => printMovement(record)}
                                  title="Imprimir movimiento"
                                  aria-label="Imprimir movimiento"
                                >
                                  <span className="material-icons-outlined">print</span>
                                </button>

                                <button
                                  type="button"
                                  className="btn-icon-action btn-delete-row"
                                  onClick={() => openCancelModal(record)}
                                  disabled={Boolean(deletingId) || record.tipo === 'cancelado'}
                                  title="Cancelar movimiento"
                                  aria-label="Cancelar movimiento"
                                >
                                  <span className="material-icons-outlined">
                                    {isDeletingCurrentRow ? 'hourglass_top' : 'block'}
                                  </span>
                                </button>
                              </>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>

              {!isLoading && !apiError && filteredRows.length > 0 && (
                <tfoot>
                  <tr className="history-total-row report-total-row">
                    <td colSpan="5" className="total-week-label">Total de la semana</td>
                    <td className="money-cell">{renderReportTotalAmount(reportTableTotals.dolares)}</td>
                    <td className="money-cell">{renderReportTotalAmount(reportTableTotals.pesos)}</td>
                    <td className="report-actions-cell"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>

        {isCanceledReport && (
          <section className="card reports-card edit-history-card">
            <div className="card-header reports-header-row">
              <div>
                <h2>Historial de ediciones</h2>
                <p className="report-section-description">
                  Cambios guardados para revisión.
                </p>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="history-table report-table edit-history-table">
                <thead>
                  <tr>
                    <th>Sem</th>
                    <th>Folio</th>
                    <th>Fecha</th>
                    <th>Nombre</th>
                    <th>Concepto</th>
                    <th>Comentario</th>
                    <th>Dólares</th>
                    <th>Pesos</th>
                    <th>Fecha ajuste</th>
                  </tr>
                </thead>

                <tbody>
                  {isEditHistoryLoading ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '18px' }}>
                        Cargando historial...
                      </td>
                    </tr>
                  ) : editHistoryError ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '18px' }}>
                        {editHistoryError}
                      </td>
                    </tr>
                  ) : editHistoryRows.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: 'center', padding: '18px' }}>
                        Todavía no hay cambios registrados.
                      </td>
                    </tr>
                  ) : (
                    editHistoryRows.map((editRow) => {
                      const info = getISOWeekInfo(editRow.fecha);
                      const hasNewAmount =
                        editRow.cantidad_nueva !== null &&
                        editRow.cantidad_nueva !== undefined &&
                        editRow.moneda_nueva;
                      const isDollarEdit = hasNewAmount && isDollarCurrency(editRow.moneda_nueva);

                      return (
                        <tr key={editRow.edit_id}>
                          {/* Propósito: mostrar únicamente el número de semana. */}
                          <td>{info.week}</td>

                          {/* Propósito: conservar el folio del movimiento editado. */}
                          <td>{editRow.folio}</td>

                          {/* Propósito: mostrar la fecha corta del movimiento original. */}
                          <td>{formatShortDate(editRow.fecha)}</td>

                          {/* Propósito: mostrar el nombre actual del movimiento. */}
                          <td>{editRow.nombre}</td>

                          {/* Propósito: mostrar el concepto actual del movimiento. */}
                          <td>{editRow.descripcion}</td>

                          {/* Propósito: mostrar el comentario capturado en la edición, si existe. */}
                          <td className="edit-history-comment-cell">
                            {editRow.comentario || '—'}
                          </td>

                          {/* Propósito: mostrar el monto nuevo solo si pertenece a dólares. */}
                          <td className="money-cell">
                            {isDollarEdit
                              ? formatMoneyByCurrency(editRow.cantidad_nueva, editRow.moneda_nueva)
                              : '—'}
                          </td>

                          {/* Propósito: mostrar el monto nuevo solo si pertenece a pesos. */}
                          <td className="money-cell">
                            {hasNewAmount && !isDollarEdit
                              ? formatMoneyByCurrency(editRow.cantidad_nueva, editRow.moneda_nueva)
                              : '—'}
                          </td>

                          {/* Propósito: mostrar cuándo se guardó el ajuste. */}
                          <td>{formatEditDateTime(editRow.edited_at)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>

      {editingRecord && (
        <div className="report-modal-backdrop" role="presentation">
          <form className="report-modal-card" onSubmit={saveEditedMovement}>
            <div className="report-modal-header">
              <div>
                <h2>Editar movimiento</h2>
                <p>Actualiza la información del folio {editingRecord.folio}.</p>
              </div>

              <button
                type="button"
                className="report-modal-close"
                onClick={closeEditModal}
                disabled={isUpdating}
                aria-label="Cerrar modal"
              >
                <span className="material-icons-outlined">close</span>
              </button>
            </div>

            <div className="report-modal-grid">
              <div className="filter-box">
                <label htmlFor="editTipo">Tipo</label>
                <select
                  id="editTipo"
                  className="filter-control"
                  value={editForm.tipo}
                  onChange={(event) => updateEditForm('tipo', event.target.value)}
                >
                  <option value="ingreso">Ingresos</option>
                  <option value="egreso">Egresos</option>
                </select>
              </div>

              <div className="filter-box">
                <label htmlFor="editFecha">Fecha</label>
                <input
                  type="date"
                  id="editFecha"
                  className="filter-control"
                  value={editForm.fecha}
                  onChange={(event) => updateEditForm('fecha', event.target.value)}
                />
              </div>

              <div className="filter-box">
                <label htmlFor="editFolio">Folio</label>
                <input
                  type="text"
                  id="editFolio"
                  className="filter-control"
                  value={editForm.folio}
                  readOnly
                  title="El folio se conserva como identificador original del movimiento."
                />
              </div>

              <div className="filter-box">
                <label htmlFor="editNombre">Nombre</label>
                <input
                  type="text"
                  id="editNombre"
                  className="filter-control"
                  value={editForm.nombre}
                  onChange={(event) => updateEditForm('nombre', event.target.value)}
                />
              </div>

              <div className="filter-box">
                <label htmlFor="editCantidad">Cantidad</label>
                <input
                  type="text"
                  id="editCantidad"
                  className="filter-control"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={formatAmountInputValue(editForm.cantidad)}
                  onChange={(event) => updateEditForm('cantidad', normalizeAmountInput(event.target.value))}
                />
              </div>

              <div className="filter-box">
                <label>Moneda *</label>

                <div className="currency-choice-group" role="radiogroup" aria-label="Seleccionar moneda">
                  {CURRENCY_OPTIONS.map((currencyOption) => (
                    <button
                      key={currencyOption.value}
                      type="button"
                      className={`currency-choice ${isCurrencySelected(editForm.moneda, currencyOption.value) ? 'selected' : ''}`}
                      onClick={() => updateEditForm('moneda', currencyOption.value)}
                      aria-pressed={isCurrencySelected(editForm.moneda, currencyOption.value)}
                    >
                      <span className="currency-choice-symbol">{currencyOption.symbol}</span>
                      <span className="currency-choice-text">
                        <strong>{currencyOption.label}</strong>
                        <small>{currencyOption.helper}</small>
                      </span>
                      <span className="material-icons-outlined currency-choice-check">check_circle</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-box report-modal-wide">
                <label htmlFor="editDescripcion">Concepto</label>
                <textarea
                  id="editDescripcion"
                  className="filter-control report-modal-textarea"
                  value={editForm.descripcion}
                  onChange={(event) => updateEditForm('descripcion', event.target.value)}
                />
              </div>

              <div className="filter-box report-modal-wide">
                <label htmlFor="editComentario">Motivo del cambio *</label>
                <textarea
                  id="editComentario"
                  className="filter-control report-modal-textarea"
                  placeholder="Explica brevemente por qué se realizó el ajuste"
                  value={editForm.comentario}
                  onChange={(event) => updateEditForm('comentario', event.target.value)}
                />
              </div>
            </div>

            <div className="report-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeEditModal}
                disabled={isUpdating}
              >
                Cancelar
              </button>

              <button type="submit" className="btn btn-dark" disabled={isUpdating}>
                <span className="material-icons-outlined">
                  {isUpdating ? 'hourglass_top' : 'save'}
                </span>
                {isUpdating ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {cancelCandidate && (
        <div className="report-modal-backdrop" role="presentation">
          <section
            className="report-modal-card cancel-confirm-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancelConfirmTitle"
          >
            <div className="cancel-confirm-top">
              <div className="cancel-confirm-icon">
                <span className="material-icons-outlined">warning</span>
              </div>

              <button
                type="button"
                className="report-modal-close"
                onClick={closeCancelModal}
                disabled={Boolean(deletingId)}
                aria-label="Cerrar confirmación de cancelación"
              >
                <span className="material-icons-outlined">close</span>
              </button>
            </div>

            <div className="cancel-confirm-content">
              <h2 id="cancelConfirmTitle">Cancelar movimiento</h2>
              <p>
                Este movimiento se marcará como cancelado. Lo verás en rojo por un momento y después aparecerá en Historial. ¿Estás seguro que deseas cancelar?
              </p>
            </div>

            <div className="cancel-confirm-summary">
              <div>
                <span>Folio</span>
                <strong>{cancelCandidate.folio}</strong>
              </div>

              <div>
                <span>Tipo</span>
                <strong>{getTypeLabel(cancelCandidate.tipo)}</strong>
              </div>

              <div>
                <span>Fecha</span>
                <strong>{formatShortDate(cancelCandidate.fecha)}</strong>
              </div>

              <div>
                <span>Monto</span>
                <strong>{formatMoneyByCurrency(cancelCandidate.cantidad)}</strong>
              </div>
            </div>

            <div className="cancel-confirm-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeCancelModal}
                disabled={Boolean(deletingId)}
              >
                No, no estoy seguro
              </button>

              <button
                type="button"
                className="btn btn-danger-formal"
                onClick={confirmCancelMovement}
                disabled={Boolean(deletingId)}
              >
                <span className="material-icons-outlined">
                  {deletingId === cancelCandidate.id ? 'hourglass_top' : 'block'}
                </span>
                {deletingId === cancelCandidate.id ? 'Cancelando...' : 'Sí, estoy seguro'}
              </button>
            </div>
          </section>
        </div>
      )}


      {selectedAdjustmentRecord && (
        <div className="report-modal-backdrop" role="presentation">
          <section className="report-modal-card adjustment-modal-card">
            <div className="report-modal-header">
              <div>
                <h2>Detalle del cambio</h2>
                <p>Folio {selectedAdjustmentRecord.folio}</p>
              </div>

              <button
                type="button"
                className="report-modal-close"
                onClick={closeAdjustmentModal}
                aria-label="Cerrar detalle del cambio"
              >
                <span className="material-icons-outlined">close</span>
              </button>
            </div>

            <div className="adjustment-detail-grid">
              <div className={`adjustment-detail-box ${fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'nombre') ? 'adjustment-detail-changed' : ''}`}>
                <span>Nombre</span>
                <strong>{getNewFieldValue(selectedAdjustmentRecord, 'nombre')}</strong>
                {fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'nombre') && (
                  <small className="adjustment-field-before">Antes: {getPreviousFieldValue(selectedAdjustmentRecord, 'nombre')}</small>
                )}
              </div>

              <div className={`adjustment-detail-box ${fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'descripcion') ? 'adjustment-detail-changed' : ''}`}>
                <span>Concepto</span>
                <strong>{getNewFieldValue(selectedAdjustmentRecord, 'descripcion')}</strong>
                {fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'descripcion') && (
                  <small className="adjustment-field-before">Antes: {getPreviousFieldValue(selectedAdjustmentRecord, 'descripcion')}</small>
                )}
              </div>

              <div className={`adjustment-detail-box ${fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'folio') ? 'adjustment-detail-changed' : ''}`}>
                <span>Folio</span>
                <strong>{getNewFieldValue(selectedAdjustmentRecord, 'folio')}</strong>
                {fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'folio') && (
                  <small className="adjustment-field-before">Antes: {getPreviousFieldValue(selectedAdjustmentRecord, 'folio')}</small>
                )}
              </div>

              <div className={`adjustment-detail-box ${fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'fecha') ? 'adjustment-detail-changed' : ''}`}>
                <span>Fecha</span>
                <strong>{formatShortDate(getNewFieldValue(selectedAdjustmentRecord, 'fecha'))}</strong>
                {fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'fecha') && (
                  <small className="adjustment-field-before">Antes: {formatShortDate(getPreviousFieldValue(selectedAdjustmentRecord, 'fecha'))}</small>
                )}
              </div>

              <div className={`adjustment-detail-box ${fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'tipo') ? 'adjustment-detail-changed' : ''}`}>
                <span>Tipo</span>
                <strong>{getTypeLabel(getNewFieldValue(selectedAdjustmentRecord, 'tipo'))}</strong>
                {fieldChangedInLastAdjustment(selectedAdjustmentRecord, 'tipo') && (
                  <small className="adjustment-field-before">Antes: {getTypeLabel(getPreviousFieldValue(selectedAdjustmentRecord, 'tipo'))}</small>
                )}
              </div>

              <div className={`adjustment-detail-box ${moneyChangedInLastAdjustment(selectedAdjustmentRecord) ? 'adjustment-detail-changed' : ''}`}>
                <span>Monto actual</span>
                <strong>
                  {formatMoneyByCurrency(
                    selectedAdjustmentRecord.cantidad_nueva,
                    selectedAdjustmentRecord.moneda_nueva
                  )}
                </strong>
                {moneyChangedInLastAdjustment(selectedAdjustmentRecord) && (
                  <small className="adjustment-field-before">
                    Antes: {formatMoneyByCurrency(
                      selectedAdjustmentRecord.cantidad_anterior,
                      selectedAdjustmentRecord.moneda_anterior
                    )}
                  </small>
                )}
              </div>

              <div className="adjustment-detail-box">
                <span>Fecha del cambio</span>
                <strong>{formatShortDate(selectedAdjustmentRecord.fecha_ultima_edicion)}</strong>
              </div>

              <div className="adjustment-detail-box adjustment-detail-difference">
                <span>Diferencia</span>
                <strong>{getAdjustmentDifference(selectedAdjustmentRecord)}</strong>
              </div>

              <div className="adjustment-detail-box adjustment-detail-comment">
                <span>Motivo del cambio</span>
                <strong>
                  {selectedAdjustmentRecord.comentario_ultima_edicion ||
                    selectedAdjustmentRecord.comentario ||
                    'Sin motivo capturado'}
                </strong>
              </div>
            </div>

            <div className="adjustment-modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={closeAdjustmentModal}
              >
                Cerrar
              </button>
            </div>
          </section>
        </div>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );
}

export default Reports;
