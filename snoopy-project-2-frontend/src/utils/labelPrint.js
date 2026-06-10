// Archivo: src/utils/labelPrint.js
// Propósito: centralizar la impresión de etiquetas para que Movimientos y Reportes usen exactamente el mismo formato.

import { formatShortDate, getISOWeekInfo } from './dates.js';
import { formatMoneyByCurrency, isDollarCurrency } from './money.js';

// Propósito: centralizar las medidas de impresión para la EC-PM-58110.
// El tamaño se redujo para acercarlo al formato anterior de campos por columnas.
const THERMAL_PAGE_WIDTH_MM = 58;
const THERMAL_PAGE_HEIGHT_MM = 205;
const THERMAL_CONTENT_WIDTH_MM = 56.5;
const THERMAL_SAFE_TOP_MM = 2;
const THERMAL_SAFE_BOTTOM_MM = 4;

// Propósito: evitar que textos capturados por el usuario rompan el HTML de impresión.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Propósito: conservar el formato escrito en conceptos largos al imprimir el ticket.
function normalizeStructuredText(value, fallback) {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();

  return text || fallback;
}

// Propósito: obtener el texto del pie según el tipo de movimiento.
function getFooterText(record) {
  if (record?.tipo === 'cancelado') return 'Registro cancelado';
  if (record?.tipo === 'egreso') return 'Registro de egreso';
  return 'Registro de ingreso';
}

// Propósito: construir los valores que se imprimirán en la etiqueta.
function buildLabelData(record) {
  const safeRecord = record || {};
  const info = getISOWeekInfo(safeRecord.fecha);
  const isDollar = isDollarCurrency(safeRecord.moneda);

  return {
    folio: safeRecord.folio || '00000000',
    fecha: formatShortDate(safeRecord.fecha),
    semana: info.week,
    nombre: String(safeRecord.nombre || '').trim() || 'Movimiento de muestra',
    concepto: normalizeStructuredText(safeRecord.descripcion, 'Descripción breve del movimiento.'),
    monto: formatMoneyByCurrency(safeRecord.cantidad || 0, safeRecord.moneda),
    moneda: isDollar ? 'Dólares' : 'Pesos',
    footerText: getFooterText(safeRecord),
  };
}

// Propósito: generar el HTML imprimible optimizado para ticket térmico de 58 mm en formato de lista vertical.
function buildPrintableLabelHtml(record) {
  const data = buildLabelData(record);

  return `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title></title>
        <style>
          @page {
            size: ${THERMAL_PAGE_WIDTH_MM}mm ${THERMAL_PAGE_HEIGHT_MM}mm;
            margin: 0;
          }

          * {
            box-sizing: border-box;
          }

          html,
          body {
            width: ${THERMAL_PAGE_WIDTH_MM}mm;
            min-width: ${THERMAL_PAGE_WIDTH_MM}mm;
            margin: 0;
            padding: 0;
            background: #ffffff;
            color: #000000;
            font-family: Arial, Helvetica, sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          body {
            overflow: visible;
          }

          /* Propósito: definir el área del papel térmico sin depender de la vista previa del navegador. */
          .print-page {
            width: ${THERMAL_PAGE_WIDTH_MM}mm;
            max-width: ${THERMAL_PAGE_WIDTH_MM}mm;
            margin: 0;
            padding: ${THERMAL_SAFE_TOP_MM}mm 0 ${THERMAL_SAFE_BOTTOM_MM}mm;
            background: #ffffff;
          }

          /* Propósito: usar casi todo el ancho de 58 mm y mantener el contenido pegado a la izquierda. */
          .label-sheet {
            width: ${THERMAL_CONTENT_WIDTH_MM}mm;
            max-width: ${THERMAL_CONTENT_WIDTH_MM}mm;
            margin: 0;
            padding: 0 0.5mm 0 0;
            background: #ffffff;
            color: #000000;
            border: none;
            border-radius: 0;
            box-shadow: none;
            page-break-inside: avoid;
            break-inside: avoid;
            text-align: left;
          }

          .label-top {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            gap: 0.8mm;
            padding-bottom: 1.2mm;
            margin-bottom: 0.6mm;
            border-bottom: 1px solid #000000;
            text-align: left;
          }

          .label-brand {
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            gap: 0.5mm;
            text-align: left;
          }

          .label-brand img {
            display: block;
            width: 11mm;
            height: 12mm;
            object-fit: contain;
            margin: 0;
          }

          .label-brand h3 {
            margin: 0;
            font-size: 24px;
            line-height: 1.05;
            font-weight: 800;
            color: #000000;
          }

          .label-body {
            display: flex;
            flex-direction: column;
            gap: 0;
            text-align: left;
          }

          /* Propósito: imprimir cada dato como una fila simple, no como dos columnas. */
          .label-line {
            display: block;
            width: 100%;
            padding: 1.25mm 0;
            border-bottom: 1px dashed #000000;
            color: #000000;
            font-size: 17.5px;
            line-height: 1.16;
            font-weight: 400;
            text-align: left;
            word-break: break-word;
          }

          /* Propósito: dejar únicamente el título del campo en negritas. */
          .label-line strong {
            font-weight: 800;
            letter-spacing: 0.02em;
            text-transform: uppercase;
          }

          /* Propósito: mantener los valores capturados con peso normal. */
          .label-line span {
            font-weight: 400;
          }

          /* Propósito: mostrar Nombre y Concepto en dos líneas: título arriba y valor debajo. */
          .label-line-stacked strong,
          .label-line-stacked span {
            display: block;
          }

          /* Propósito: separar ligeramente el valor para mejorar la lectura del ticket. */
          .label-line-stacked span {
            margin-top: 0.8mm;
          }

          /* Propósito: respetar saltos de línea y estructura en el campo Concepto. */
          .label-line-concept .structured-text {
            white-space: pre-wrap;
            word-break: break-word;
            overflow-wrap: anywhere;
            line-height: 1.2;
          }

          .label-footer {
            margin-top: 5mm;
            padding-top: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1.2mm;
            text-align: center;
          }

          /* Propósito: usar el espacio del código de barras y folio inferior para la firma. */
          .signature-area {
            width: 100%;
            min-height: 58mm;
            margin-top: 0;
            padding-top: 45mm;
            text-align: center;
          }

          .signature-line {
            width: 82%;
            height: 1px;
            background: #000000;
            margin: 0 auto 1.2mm;
          }

          .signature-label {
            font-size: 17.5px;
            line-height: 1.12;
            font-weight: 400;
            color: #000000;
          }

          .print-note {
            margin-top: 0;
            font-size: 17.5px;
            line-height: 1.16;
            font-weight: 400;
            color: #000000;
            text-transform: none;
          }

          @media print {
            @page {
              size: ${THERMAL_PAGE_WIDTH_MM}mm ${THERMAL_PAGE_HEIGHT_MM}mm;
              margin: 0;
            }

            html,
            body {
              width: ${THERMAL_PAGE_WIDTH_MM}mm !important;
              min-width: ${THERMAL_PAGE_WIDTH_MM}mm !important;
              max-width: ${THERMAL_PAGE_WIDTH_MM}mm !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: visible !important;
              background: #ffffff !important;
              position: static !important;
            }

            .print-page {
              width: ${THERMAL_PAGE_WIDTH_MM}mm !important;
              max-width: ${THERMAL_PAGE_WIDTH_MM}mm !important;
              margin: 0 !important;
              padding: ${THERMAL_SAFE_TOP_MM}mm 0 ${THERMAL_SAFE_BOTTOM_MM}mm !important;
              background: #ffffff !important;
            }

            .label-sheet {
              width: ${THERMAL_CONTENT_WIDTH_MM}mm !important;
              max-width: ${THERMAL_CONTENT_WIDTH_MM}mm !important;
              margin: 0 !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        </style>
      </head>
      <body>
        <main class="print-page">
          <section class="label-sheet">
            <div class="label-top">
              <div class="label-brand">
                <div>
                  <h3>Oficinas TJ</h3>
                </div>
              </div>
            </div>

            <div class="label-body">
              <div class="label-line"><strong>Folio:</strong> <span>${escapeHtml(data.folio)}</span></div>
              <div class="label-line"><strong>Fecha:</strong> <span>${escapeHtml(data.fecha)}</span></div>
              <div class="label-line"><strong>Semana:</strong> <span>${escapeHtml(data.semana)}</span></div>
              <div class="label-line label-line-stacked"><strong>Nombre:</strong> <span>${escapeHtml(data.nombre)}</span></div>
              <div class="label-line label-line-stacked label-line-concept"><strong>Concepto:</strong> <span class="structured-text">${escapeHtml(data.concepto)}</span></div>
              <div class="label-line"><strong>Monto:</strong> <span>${escapeHtml(data.monto)}</span></div>
              <div class="label-line"><strong>Moneda:</strong> <span>${escapeHtml(data.moneda)}</span></div>
            </div>

            <div class="label-footer">
              <div class="signature-area">
                <div class="signature-line"></div>
                <div class="signature-label">Firma de recibido</div>
              </div>

              <div class="print-note">${escapeHtml(data.footerText)}</div>
            </div>
          </section>
        </main>
      </body>
    </html>
  `;
}

// Propósito: esperar a que las imágenes del recibo carguen antes de mandar a imprimir.
function waitForPrintableAssets(printDocument) {
  const images = Array.from(printDocument.images || []);

  if (!images.length) {
    return Promise.resolve();
  }

  return Promise.all(
    images.map((image) => {
      if (image.complete) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        image.onload = resolve;
        image.onerror = resolve;
      });
    }),
  );
}

// Propósito: mostrar un botón manual si el navegador bloquea la impresión automática.
function showManualPrintFallback(printFrame, onAfterPrint) {
  const previousFallback = document.getElementById('snoopy-print-fallback');

  if (previousFallback) {
    previousFallback.remove();
  }

  const fallback = document.createElement('div');
  fallback.id = 'snoopy-print-fallback';
  fallback.style.position = 'fixed';
  fallback.style.right = '18px';
  fallback.style.bottom = '18px';
  fallback.style.zIndex = '999999';
  fallback.style.display = 'flex';
  fallback.style.alignItems = 'center';
  fallback.style.gap = '10px';
  fallback.style.padding = '12px 14px';
  fallback.style.border = '1px solid #cbd5e1';
  fallback.style.borderRadius = '14px';
  fallback.style.background = '#ffffff';
  fallback.style.boxShadow = '0 18px 45px rgba(15, 23, 42, 0.18)';
  fallback.style.fontFamily = 'Arial, Helvetica, sans-serif';

  fallback.innerHTML = `
    <span style="font-size:13px;color:#334155;">No se abrió la impresión automáticamente.</span>
    <button type="button" id="snoopy-print-fallback-button" style="border:0;border-radius:10px;background:#0f172a;color:white;padding:9px 12px;font-size:13px;font-weight:700;cursor:pointer;">
      Imprimir comprobante
    </button>
    <button type="button" id="snoopy-print-fallback-close" style="border:0;background:transparent;color:#64748b;font-size:18px;line-height:1;cursor:pointer;">
      ×
    </button>
  `;

  document.body.appendChild(fallback);

  const printButton = fallback.querySelector('#snoopy-print-fallback-button');
  const closeButton = fallback.querySelector('#snoopy-print-fallback-close');

  printButton?.addEventListener('click', () => {
    printFrame.contentWindow?.focus();
    printFrame.contentWindow?.print();
    fallback.remove();
    onAfterPrint?.();
  });

  closeButton?.addEventListener('click', () => {
    fallback.remove();
  });
}

// Propósito: imprimir desde un iframe oculto para evitar bloqueos de ventanas emergentes en Chrome/Windows.
export function printMovementLabel(record, options = {}) {
  const previousFrame = document.getElementById('snoopy-receipt-print-frame');

  if (previousFrame) {
    previousFrame.remove();
  }

  const printFrame = document.createElement('iframe');
  printFrame.id = 'snoopy-receipt-print-frame';
  printFrame.title = 'Impresión de comprobante Snoopy Project 2';
  printFrame.style.position = 'fixed';
  printFrame.style.right = '0';
  printFrame.style.bottom = '0';
  printFrame.style.width = '1px';
  printFrame.style.height = '1px';
  printFrame.style.border = '0';
  printFrame.style.opacity = '0';
  printFrame.style.pointerEvents = 'none';

  document.body.appendChild(printFrame);

  const printDocument = printFrame.contentDocument || printFrame.contentWindow?.document;

  if (!printDocument) {
    options.onPopupBlocked?.();
    return false;
  }

  let finished = false;

  // Propósito: limpiar recursos temporales sin cerrar ninguna ventana del navegador.
  const finishPrint = () => {
    if (finished) return;
    finished = true;
    options.onAfterPrint?.();

    window.setTimeout(() => {
      printFrame.remove();
    }, 1000);
  };

  printDocument.open();
  printDocument.write(buildPrintableLabelHtml(record));
  printDocument.close();

  if (printFrame.contentWindow) {
    printFrame.contentWindow.onafterprint = finishPrint;
  }

  // Propósito: esperar a que el DOM del iframe y el logotipo estén listos antes de imprimir.
  window.setTimeout(() => {
    waitForPrintableAssets(printDocument)
      .then(() => {
        printFrame.contentWindow?.focus();
        printFrame.contentWindow?.print();

        // Propósito: dejar un respaldo manual por si Chrome o el driver bloquean el disparo automático.
        window.setTimeout(() => {
          if (!finished && document.body.contains(printFrame)) {
            showManualPrintFallback(printFrame, finishPrint);
          }
        }, 1200);
      })
      .catch(() => {
        showManualPrintFallback(printFrame, finishPrint);
      });
  }, 250);

  return true;
}
