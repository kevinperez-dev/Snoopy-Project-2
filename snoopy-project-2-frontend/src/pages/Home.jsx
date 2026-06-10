// Archivo: src/pages/Home.jsx
// Propósito: vista inicial tipo Excel para control semanal de caja chica por moneda

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Header from '../components/Header.jsx';
import { getMovements } from '../services/movementsApi.js';
import { getCurrentISOWeek, getISOWeekInfo, getISOWeekStart, getMaxAllowedWeekForYear, getWeekLabel, formatShortDate } from '../utils/dates.js';
import { getCurrencyBucket, renderCurrencyAmount } from '../utils/money.js';
import { isAuthenticated } from '../utils/session.js';


// Propósito: cargar el saldo inicial guardado por semana y moneda.
function getStoredBalances(year, weekNumber) {
    const oldSingleBalanceKey = `snoopyProject2SaldoInicial_${year}_${weekNumber}`;
    const pesosKey = `snoopyProject2SaldoInicialPesos_${year}_${weekNumber}`;
    const dollarsKey = `snoopyProject2SaldoInicialDolares_${year}_${weekNumber}`;

    return {
        pesos: localStorage.getItem(pesosKey) ?? localStorage.getItem(oldSingleBalanceKey) ?? '0',
        dolares: localStorage.getItem(dollarsKey) ?? '0'
    };
}

// Propósito: convertir año/semana ISO en un valor numérico comparable.
function getWeekStartTime(year, weekNumber) {
    return getISOWeekStart(Number(year), Number(weekNumber)).getTime();
}


// Propósito: escapar caracteres especiales para generar XML compatible con Excel.
function escapeExcelXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}


// Propósito: convertir número de columna base cero a nombre de columna de Excel.
function getExcelColumnName(columnIndex) {
    let index = columnIndex + 1;
    let columnName = '';

    while (index > 0) {
        const remainder = (index - 1) % 26;
        columnName = String.fromCharCode(65 + remainder) + columnName;
        index = Math.floor((index - 1) / 26);
    }

    return columnName;
}

// Propósito: crear una celda XML para un archivo .xlsx real.
function createXlsxCell(rowIndex, columnIndex, value, styleId = 5) {
    const cellReference = `${getExcelColumnName(columnIndex)}${rowIndex}`;

    if (value && typeof value === 'object' && value.type === 'number') {
        const numericValue = Number(value.value);

        if (!Number.isFinite(numericValue)) {
            return `<c r="${cellReference}" s="${styleId}"/>`;
        }

        return `<c r="${cellReference}" s="${styleId}"><v>${numericValue}</v></c>`;
    }

    return `<c r="${cellReference}" t="inlineStr" s="${styleId}"><is><t>${escapeExcelXml(value)}</t></is></c>`;
}

// Propósito: preparar montos como números reales para que Excel permita fórmulas y sumas.
function createXlsxMoneyValue(value, options = {}) {
    const normalizedValue = typeof value === 'number'
        ? value
        : String(value ?? '0')
            .replace(/\$/g, '')
            .replace(/,/g, '')
            .replace(/\s/g, '')
            .trim();
    const numericValue = Number(normalizedValue || 0);

    if (!Number.isFinite(numericValue)) {
        return { type: 'number', value: null };
    }

    if (options.blankWhenZero && numericValue === 0) {
        return { type: 'number', value: null };
    }

    return { type: 'number', value: numericValue };
}

// Propósito: crear una fila XML para un archivo .xlsx real.
function createXlsxRow(rowIndex, cells, height = null) {
    const heightAttributes = height ? ` ht="${height}" customHeight="1"` : '';
    const cellsXml = cells
        .map((cell) => createXlsxCell(rowIndex, cell.column, cell.value, cell.styleId))
        .join('');

    return `<row r="${rowIndex}"${heightAttributes}>${cellsXml}</row>`;
}

// Propósito: crear la imagen SVG del resumen semanal en fila para insertarla como imagen dentro del Excel.
function buildWeeklySummarySvg(summarySections) {
    const width = 390;
    const height = 520;
    const sectionGap = 22;
    const titleHeight = 22;
    const cardHeight = 64;
    const cardWidth = 148;
    const leftX = 34;
    const rightX = 206;
    let currentY = 32;

    const sectionXml = summarySections.map((section) => {
        const titleY = currentY;
        const cardY = currentY + titleHeight;
        currentY += titleHeight + cardHeight + sectionGap;

        const background = section.isFinal
            ? `<rect x="24" y="${titleY - 4}" width="342" height="${titleHeight + cardHeight + 14}" rx="0" fill="#FFFBEB"/>`
            : '';

        return `
            ${background}
            <text x="34" y="${titleY + 13}" class="section-title">${escapeExcelXml(section.title)}</text>

            <g>
                <rect x="${leftX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="11" class="dollar-card"/>
                <text x="${leftX + 14}" y="${cardY + 23}" class="dollar-label">DÓLARES</text>
                <text x="${leftX + 14}" y="${cardY + 47}" class="dollar-value">${escapeExcelXml(section.dollars)}</text>
            </g>

            <g>
                <rect x="${rightX}" y="${cardY}" width="${cardWidth}" height="${cardHeight}" rx="11" class="peso-card"/>
                <text x="${rightX + 14}" y="${cardY + 23}" class="peso-label">PESOS</text>
                <text x="${rightX + 14}" y="${cardY + 47}" class="peso-value">${escapeExcelXml(section.pesos)}</text>
            </g>
        `;
    }).join('');

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <style>
                .sheet-bg { fill: #ffffff; }
                .section-title {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 12px;
                    font-weight: 700;
                    letter-spacing: 1px;
                    fill: #5B6472;
                }
                .dollar-card {
                    fill: #EFF6FF;
                    stroke: #1D4ED8;
                    stroke-width: 1.2;
                }
                .peso-card {
                    fill: #F0FDF4;
                    stroke: #16A34A;
                    stroke-width: 1.2;
                }
                .dollar-label,
                .peso-label {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: .8px;
                }
                .dollar-label { fill: #1D4ED8; }
                .peso-label { fill: #15803D; }
                .dollar-value,
                .peso-value {
                    font-family: Arial, Helvetica, sans-serif;
                    font-size: 17px;
                    font-weight: 700;
                }
                .dollar-value { fill: #1E40AF; }
                .peso-value { fill: #166534; }
            </style>
            <rect class="sheet-bg" x="0" y="0" width="${width}" height="${height}"/>
            ${sectionXml}
        </svg>
    `;

    return { svg, width, height };
}

// Propósito: convertir una imagen SVG generada en memoria a PNG para que Excel la pueda incrustar correctamente.
function svgToPngBytes(svg, width, height) {
    return new Promise((resolve, reject) => {
        const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
        const svgUrl = URL.createObjectURL(svgBlob);
        const image = new Image();

        image.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2;
            canvas.width = width * scale;
            canvas.height = height * scale;

            const context = canvas.getContext('2d');
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(async (blob) => {
                URL.revokeObjectURL(svgUrl);

                if (!blob) {
                    reject(new Error('No fue posible generar la imagen del resumen semanal.'));
                    return;
                }

                const buffer = await blob.arrayBuffer();
                resolve(new Uint8Array(buffer));
            }, 'image/png');
        };

        image.onerror = () => {
            URL.revokeObjectURL(svgUrl);
            reject(new Error('No fue posible cargar la imagen SVG del resumen semanal.'));
        };

        image.src = svgUrl;
    });
}

// Propósito: escribir un entero de 16 bits en formato little-endian para crear el ZIP del .xlsx.
function writeUint16(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
}

// Propósito: escribir un entero de 32 bits en formato little-endian para crear el ZIP del .xlsx.
function writeUint32(target, offset, value) {
    target[offset] = value & 0xff;
    target[offset + 1] = (value >>> 8) & 0xff;
    target[offset + 2] = (value >>> 16) & 0xff;
    target[offset + 3] = (value >>> 24) & 0xff;
}

const crcTable = (() => {
    const table = new Uint32Array(256);

    for (let i = 0; i < 256; i += 1) {
        let crc = i;

        for (let j = 0; j < 8; j += 1) {
            crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
        }

        table[i] = crc >>> 0;
    }

    return table;
})();

// Propósito: calcular CRC32 de cada archivo incluido en el .xlsx.
function getCrc32(bytes) {
    let crc = 0xffffffff;

    for (let index = 0; index < bytes.length; index += 1) {
        crc = crcTable[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
    }

    return (crc ^ 0xffffffff) >>> 0;
}

// Propósito: convertir texto o bytes a Uint8Array para empaquetarlo dentro del ZIP.
function toBytes(content) {
    if (content instanceof Uint8Array) {
        return content;
    }

    return new TextEncoder().encode(content);
}

// Propósito: unir varios arreglos de bytes en un solo Uint8Array.
function concatBytes(parts) {
    const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(totalLength);
    let offset = 0;

    parts.forEach((part) => {
        output.set(part, offset);
        offset += part.length;
    });

    return output;
}

// Propósito: crear un ZIP sin compresión con la estructura interna de un archivo .xlsx.
function createZip(files) {
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    files.forEach((file) => {
        const nameBytes = toBytes(file.name);
        const contentBytes = toBytes(file.content);
        const crc = getCrc32(contentBytes);
        const localHeader = new Uint8Array(30 + nameBytes.length);

        writeUint32(localHeader, 0, 0x04034b50);
        writeUint16(localHeader, 4, 20);
        writeUint16(localHeader, 6, 0);
        writeUint16(localHeader, 8, 0);
        writeUint16(localHeader, 10, dosTime);
        writeUint16(localHeader, 12, dosDate);
        writeUint32(localHeader, 14, crc);
        writeUint32(localHeader, 18, contentBytes.length);
        writeUint32(localHeader, 22, contentBytes.length);
        writeUint16(localHeader, 26, nameBytes.length);
        writeUint16(localHeader, 28, 0);
        localHeader.set(nameBytes, 30);

        localParts.push(localHeader, contentBytes);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        writeUint32(centralHeader, 0, 0x02014b50);
        writeUint16(centralHeader, 4, 20);
        writeUint16(centralHeader, 6, 20);
        writeUint16(centralHeader, 8, 0);
        writeUint16(centralHeader, 10, 0);
        writeUint16(centralHeader, 12, dosTime);
        writeUint16(centralHeader, 14, dosDate);
        writeUint32(centralHeader, 16, crc);
        writeUint32(centralHeader, 20, contentBytes.length);
        writeUint32(centralHeader, 24, contentBytes.length);
        writeUint16(centralHeader, 28, nameBytes.length);
        writeUint16(centralHeader, 30, 0);
        writeUint16(centralHeader, 32, 0);
        writeUint16(centralHeader, 34, 0);
        writeUint16(centralHeader, 36, 0);
        writeUint32(centralHeader, 38, 0);
        writeUint32(centralHeader, 42, offset);
        centralHeader.set(nameBytes, 46);

        centralParts.push(centralHeader);
        offset += localHeader.length + contentBytes.length;
    });

    const centralDirectory = concatBytes(centralParts);
    const endRecord = new Uint8Array(22);

    writeUint32(endRecord, 0, 0x06054b50);
    writeUint16(endRecord, 4, 0);
    writeUint16(endRecord, 6, 0);
    writeUint16(endRecord, 8, files.length);
    writeUint16(endRecord, 10, files.length);
    writeUint32(endRecord, 12, centralDirectory.length);
    writeUint32(endRecord, 16, offset);
    writeUint16(endRecord, 20, 0);

    return concatBytes([...localParts, centralDirectory, endRecord]);
}

// Propósito: crear los estilos básicos del archivo .xlsx.
function buildXlsxStylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="$#,##0.00"/>
  </numFmts>
  <fonts count="9">
    <font><sz val="10"/><color rgb="FF222222"/><name val="Calibri"/></font>
    <font><b/><sz val="16"/><color rgb="FF111827"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF111827"/><name val="Calibri"/></font>
    <font><b/><sz val="12"/><color rgb="FF111827"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF1D4ED8"/><name val="Calibri"/></font>
    <font><sz val="10"/><color rgb="FF16A34A"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF1D4ED8"/><name val="Calibri"/></font>
    <font><b/><sz val="10"/><color rgb="FF16A34A"/><name val="Calibri"/></font>
  </fonts>
  <fills count="7">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF2FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFFAF0"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="3">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border>
    <border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="13">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="7" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="8" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="6" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="7" fillId="4" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1"/></xf>
    <xf numFmtId="164" fontId="8" fillId="5" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

// Propósito: crear la hoja principal del archivo .xlsx con imagen de resumen en fila y registros visibles.
function buildXlsxSheetXml({ weekText, cashRows, totals }) {
    const rows = [];

    rows.push(createXlsxRow(1, [{ column: 0, value: 'Control semanal', styleId: 1 }], 28));
    rows.push(createXlsxRow(2, [
        { column: 0, value: 'Registros mostrados', styleId: 3 },
        { column: 7, value: weekText, styleId: 2 }
    ], 24));

    const headers = [
        'Fecha',
        'Folio',
        'Descripción',
        'Ingreso dólares',
        'Ingreso pesos',
        'Egreso dólares',
        'Egreso pesos',
        'Quedó en caja dólares',
        'Quedó en caja pesos'
    ];

    rows.push(createXlsxRow(3, headers.map((header, index) => {
        const styleId = [3, 5, 7].includes(index)
            ? 7
            : [4, 6, 8].includes(index)
                ? 8
                : 4;

        return {
            column: index,
            value: header,
            styleId
        };
    }), 24));

    cashRows.forEach((row, index) => {
        const currentRow = 4 + index;
        const values = [
            formatShortDate(row.fecha) || '',
            row.folio || '',
            row.descripcion || '',
            createXlsxMoneyValue(row.ingresoDolares, { blankWhenZero: true }),
            createXlsxMoneyValue(row.ingresoPesos, { blankWhenZero: true }),
            createXlsxMoneyValue(row.egresoDolares, { blankWhenZero: true }),
            createXlsxMoneyValue(row.egresoPesos, { blankWhenZero: true }),
            createXlsxMoneyValue(row.saldoDolares),
            createXlsxMoneyValue(row.saldoPesos)
        ];

        rows.push(createXlsxRow(currentRow, values.map((value, column) => {
            const styleId = [3, 5, 7].includes(column)
                ? 9
                : [4, 6, 8].includes(column)
                    ? 10
                    : 5;

            return {
                column,
                value,
                styleId
            };
        }), 22));
    });

    const totalRowIndex = 4 + cashRows.length;
    const totalValues = [
        '',
        '',
        'Totales de la semana',
        createXlsxMoneyValue(totals.totalIngresosDolares),
        createXlsxMoneyValue(totals.totalIngresosPesos),
        createXlsxMoneyValue(totals.totalEgresosDolares),
        createXlsxMoneyValue(totals.totalEgresosPesos),
        createXlsxMoneyValue(totals.finalBalanceDolares),
        createXlsxMoneyValue(totals.finalBalancePesos)
    ];

    rows.push(createXlsxRow(totalRowIndex, totalValues.map((value, column) => {
        const styleId = [3, 5, 7].includes(column)
            ? 11
            : [4, 6, 8].includes(column)
                ? 12
                : 6;

        return {
            column,
            value,
            styleId
        };
    }), 24));

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"/></sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>
    <col min="1" max="1" width="13" customWidth="1"/>
    <col min="2" max="2" width="15" customWidth="1"/>
    <col min="3" max="3" width="26" customWidth="1"/>
    <col min="4" max="9" width="15" customWidth="1"/>
    <col min="10" max="10" width="3" customWidth="1"/>
    <col min="11" max="17" width="12" customWidth="1"/>
  </cols>
  <sheetData>
    ${rows.join('\n    ')}
  </sheetData>
  <mergeCells count="3">
    <mergeCell ref="A1:I1"/>
    <mergeCell ref="A2:G2"/>
    <mergeCell ref="H2:I2"/>
  </mergeCells>
  <drawing r:id="rId1"/>
</worksheet>`;
}

// Propósito: crear el XML del dibujo que posiciona la imagen del resumen a la derecha de la tabla.
function buildDrawingXml(width, height) {
    const cx = width * 9525;
    const cy = height * 9525;

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:oneCellAnchor editAs="oneCell">
    <xdr:from>
      <xdr:col>10</xdr:col>
      <xdr:colOff>0</xdr:colOff>
      <xdr:row>1</xdr:row>
      <xdr:rowOff>0</xdr:rowOff>
    </xdr:from>
    <xdr:ext cx="${cx}" cy="${cy}"/>
    <xdr:pic>
      <xdr:nvPicPr>
        <xdr:cNvPr id="2" name="Resumen semanal"/>
        <xdr:cNvPicPr/>
      </xdr:nvPicPr>
      <xdr:blipFill>
        <a:blip r:embed="rId1"/>
        <a:stretch><a:fillRect/></a:stretch>
      </xdr:blipFill>
      <xdr:spPr>
        <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
      </xdr:spPr>
    </xdr:pic>
    <xdr:clientData/>
  </xdr:oneCellAnchor>
</xdr:wsDr>`;
}

// Propósito: construir todos los archivos internos que componen el .xlsx.
function buildXlsxFiles({ sheetName, weekText, summaryImageBytes, imageWidth, imageHeight, cashRows, totals }) {
    return [
        {
            name: '[Content_Types].xml',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`
        },
        {
            name: '_rels/.rels',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`
        },
        {
            name: 'docProps/core.xml',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Control semanal</dc:title>
  <dc:creator>Snoopy Project 2</dc:creator>
  <cp:lastModifiedBy>Snoopy Project 2</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`
        },
        {
            name: 'docProps/app.xml',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Snoopy Project 2</Application>
</Properties>`
        },
        {
            name: 'xl/workbook.xml',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeExcelXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
        },
        {
            name: 'xl/styles.xml',
            content: buildXlsxStylesXml()
        },
        {
            name: 'xl/worksheets/sheet1.xml',
            content: buildXlsxSheetXml({ weekText, cashRows, totals })
        },
        {
            name: 'xl/worksheets/_rels/sheet1.xml.rels',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`
        },
        {
            name: 'xl/drawings/drawing1.xml',
            content: buildDrawingXml(imageWidth, imageHeight)
        },
        {
            name: 'xl/drawings/_rels/drawing1.xml.rels',
            content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/resumen_semanal.png"/>
</Relationships>`
        },
        {
            name: 'xl/media/resumen_semanal.png',
            content: summaryImageBytes
        }
    ];
}

// Propósito: descargar un archivo .xlsx real con una imagen incrustada del resumen semanal.
async function downloadExcelWithSummaryImage({ fileName, sheetName, weekText, summarySections, cashRows, totals }) {
    const { svg, width, height } = buildWeeklySummarySvg(summarySections);
    const summaryImageBytes = await svgToPngBytes(svg, width, height);
    const files = buildXlsxFiles({
        sheetName,
        weekText,
        summaryImageBytes,
        imageWidth: width,
        imageHeight: height,
        cashRows,
        totals
    });
    const zipBytes = createZip(files);
    const blob = new Blob([zipBytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `${fileName}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function Home() {
    const navigate = useNavigate();

    // Movimientos cargados desde PostgreSQL
    const [records, setRecords] = useState([]);

    // Estados generales de carga
    const [isLoading, setIsLoading] = useState(true);
    const [apiError, setApiError] = useState('');

    // Semana seleccionada
    const currentWeek = getCurrentISOWeek();
    const [period, setPeriod] = useState(String(currentWeek.year));
    const [week, setWeek] = useState(String(currentWeek.week));

    // Saldo inicial temporal por semana y moneda
    // Después se puede guardar en PostgreSQL con una tabla weekly_balances
    const initialStoredBalances = getStoredBalances(currentWeek.year, currentWeek.week);
    const [manualStartingBalancePesos, setManualStartingBalancePesos] = useState(initialStoredBalances.pesos);
    const [manualStartingBalanceDolares, setManualStartingBalanceDolares] = useState(initialStoredBalances.dolares);

    // Años visibles
    const years = useMemo(() => {
        return [currentWeek.year - 1, currentWeek.year];
    }, [currentWeek.year]);

    // Semanas visibles según el periodo
    const weeks = useMemo(() => {
        const maxWeek = getMaxAllowedWeekForYear(Number(period), records);
        return Array.from({ length: maxWeek }, (_, index) => maxWeek - index);
    }, [period, records]);

    // Semana segura para evitar seleccionar una semana inexistente
    const selectedWeek = weeks.includes(Number(week))
        ? String(week)
        : weeks.length > 0
            ? String(weeks[0])
            : String(currentWeek.week);

    // Renderiza celdas de ingresos/egresos; si no hay importe, muestra --.
    const renderMovementAmount = (amount) => {
        return Number(amount || 0) > 0 ? renderCurrencyAmount(amount) : '--';
    };

    // Formatea cantidades editables con comas sin agregar símbolos de moneda.
    const formatBalanceInputValue = (value) => {
        if (value === null || value === undefined || value === '') return '';

        const cleanValue = String(value).replace(/,/g, '');

        if (Number.isNaN(Number(cleanValue))) return '';

        const [integerPart, decimalPart] = cleanValue.split('.');
        const formattedInteger = new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 0
        }).format(Number(integerPart || 0));

        return decimalPart !== undefined
            ? `${formattedInteger}.${decimalPart.slice(0, 2)}`
            : formattedInteger;
    };

    // Limpia el texto capturado para guardar solo números y punto decimal.
    const cleanBalanceInputValue = (value) => {
        const cleanValue = String(value || '')
            .replace(/,/g, '')
            .replace(/[^0-9.]/g, '');

        const parts = cleanValue.split('.');

        if (parts.length <= 1) return cleanValue;

        return `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
    };

    // Carga el saldo inicial manual correspondiente cuando cambia el periodo o la semana.
    const loadStartingBalances = useCallback((year, weekNumber) => {
        const storedBalances = getStoredBalances(year, weekNumber);
        setManualStartingBalancePesos(storedBalances.pesos);
        setManualStartingBalanceDolares(storedBalances.dolares);
    }, []);

    // Movimientos activos que sí participan en saldos.
    const activeRecords = useMemo(() => {
        return records.filter((record) => record.tipo !== 'cancelado');
    }, [records]);

    // Calcula el saldo inicial de la semana seleccionada con arrastre automático.
    const computedInitialBalances = useMemo(() => {
        const selectedYear = Number(period);
        const selectedWeekNumber = Number(selectedWeek);
        const selectedWeekStart = getWeekStartTime(selectedYear, selectedWeekNumber);

        const relevantRecords = activeRecords.filter((record) => {
            const info = getISOWeekInfo(record.fecha);
            return getWeekStartTime(info.year, info.week) <= selectedWeekStart;
        });

        if (!relevantRecords.length) {
            return {
                pesos: Number(manualStartingBalancePesos || 0),
                dolares: Number(manualStartingBalanceDolares || 0),
                isAutomatic: false,
                baseYear: selectedYear,
                baseWeek: selectedWeekNumber
            };
        }

        const sortedWeekStarts = relevantRecords
            .map((record) => {
                const info = getISOWeekInfo(record.fecha);
                return {
                    year: info.year,
                    week: info.week,
                    start: getWeekStartTime(info.year, info.week)
                };
            })
            .sort((a, b) => a.start - b.start);

        const baseWeekInfo = sortedWeekStarts[0];
        const baseBalances = getStoredBalances(baseWeekInfo.year, baseWeekInfo.week);

        const carriedBalances = relevantRecords.reduce(
            (accumulator, record) => {
                const info = getISOWeekInfo(record.fecha);
                const recordWeekStart = getWeekStartTime(info.year, info.week);

                if (recordWeekStart >= selectedWeekStart) {
                    return accumulator;
                }

                const amount = Number(record.cantidad || 0);
                const currency = getCurrencyBucket(record.moneda);
                const multiplier = record.tipo === 'ingreso' ? 1 : -1;

                if (currency === 'dolares') {
                    accumulator.dolares += amount * multiplier;
                } else {
                    accumulator.pesos += amount * multiplier;
                }

                return accumulator;
            },
            {
                pesos: Number(baseBalances.pesos || 0),
                dolares: Number(baseBalances.dolares || 0)
            }
        );

        return {
            ...carriedBalances,
            isAutomatic: baseWeekInfo.start < selectedWeekStart,
            baseYear: baseWeekInfo.year,
            baseWeek: baseWeekInfo.week
        };
    }, [
        activeRecords,
        period,
        selectedWeek,
        manualStartingBalancePesos,
        manualStartingBalanceDolares
    ]);


    // Busca la última semana que sí tiene movimientos para no mostrar inicio vacío por defecto.
    const getLatestWeekWithRecords = (movementList) => {
        const activeMovements = movementList.filter((movement) => movement.tipo !== 'cancelado');

        if (!activeMovements.length) return null;

        const sortedRecords = [...activeMovements].sort((a, b) => {
            const dateA = new Date(`${a.fecha}T00:00:00`).getTime();
            const dateB = new Date(`${b.fecha}T00:00:00`).getTime();

            if (dateA !== dateB) {
                return dateB - dateA;
            }

            return Number(b.id || 0) - Number(a.id || 0);
        });

        const latestInfo = getISOWeekInfo(sortedRecords[0].fecha);

        return {
            year: String(latestInfo.year),
            week: String(latestInfo.week)
        };
    };

    // Movimientos de la semana seleccionada
    const weeklyRecords = useMemo(() => {
        return activeRecords
            .filter((record) => {
                const info = getISOWeekInfo(record.fecha);

                return (
                    info.year === Number(period) &&
                    info.week === Number(selectedWeek)
                );
            })
            .sort((a, b) => {
                const dateA = new Date(`${a.fecha}T00:00:00`);
                const dateB = new Date(`${b.fecha}T00:00:00`);

                if (dateA.getTime() !== dateB.getTime()) {
                    return dateA - dateB;
                }

                return Number(a.id) - Number(b.id);
            });
    }, [activeRecords, period, selectedWeek]);

    // Tabla tipo Excel con saldo acumulado separado por pesos y dólares
    const cashRows = useMemo(() => {
        const initialBalancePesos = Number(computedInitialBalances.pesos || 0);
        const initialBalanceDolares = Number(computedInitialBalances.dolares || 0);

        // Fila inicial de la semana
        const initialRow = {
            id: 'saldo-inicial',
            fecha: '',
            folio: '',
            descripcion: 'Inicio de semana',
            ingresoPesos: null,
            ingresoDolares: null,
            egresoPesos: null,
            egresoDolares: null,
            saldoPesos: initialBalancePesos,
            saldoDolares: initialBalanceDolares,
            rowType: 'initial'
        };

        // Se generan las filas calculando el saldo independiente por moneda
        const { rows } = weeklyRecords.reduce(
            (accumulator, record) => {
                const amount = Number(record.cantidad || 0);
                const isIncome = record.tipo === 'ingreso';
                const currency = getCurrencyBucket(record.moneda);
                const isPesos = currency === 'pesos';

                const ingresoPesos = isIncome && isPesos ? amount : null;
                const ingresoDolares = isIncome && !isPesos ? amount : null;
                const egresoPesos = !isIncome && isPesos ? amount : null;
                const egresoDolares = !isIncome && !isPesos ? amount : null;

                const nextBalancePesos =
                    accumulator.balancePesos + Number(ingresoPesos || 0) - Number(egresoPesos || 0);

                const nextBalanceDolares =
                    accumulator.balanceDolares + Number(ingresoDolares || 0) - Number(egresoDolares || 0);

                const row = {
                    id: record.id,
                    fecha: record.fecha,
                    folio: record.folio,
                    descripcion: record.descripcion || record.nombre,
                    ingresoPesos,
                    ingresoDolares,
                    egresoPesos,
                    egresoDolares,
                    saldoPesos: nextBalancePesos,
                    saldoDolares: nextBalanceDolares,
                    rowType: record.tipo
                };

                return {
                    balancePesos: nextBalancePesos,
                    balanceDolares: nextBalanceDolares,
                    rows: [...accumulator.rows, row]
                };
            },
            {
                balancePesos: initialBalancePesos,
                balanceDolares: initialBalanceDolares,
                rows: []
            }
        );

        return [initialRow, ...rows];
    }, [weeklyRecords, computedInitialBalances]);

    // Totales de la semana separados por moneda
    const totals = useMemo(() => {
        const weeklyTotals = weeklyRecords.reduce(
            (accumulator, record) => {
                const amount = Number(record.cantidad || 0);
                const currency = getCurrencyBucket(record.moneda);
                const isIncome = record.tipo === 'ingreso';

                if (isIncome && currency === 'pesos') {
                    accumulator.totalIngresosPesos += amount;
                }

                if (isIncome && currency === 'dolares') {
                    accumulator.totalIngresosDolares += amount;
                }

                if (!isIncome && currency === 'pesos') {
                    accumulator.totalEgresosPesos += amount;
                }

                if (!isIncome && currency === 'dolares') {
                    accumulator.totalEgresosDolares += amount;
                }

                return accumulator;
            },
            {
                totalIngresosPesos: 0,
                totalIngresosDolares: 0,
                totalEgresosPesos: 0,
                totalEgresosDolares: 0
            }
        );

        const initialBalancePesos = Number(computedInitialBalances.pesos || 0);
        const initialBalanceDolares = Number(computedInitialBalances.dolares || 0);

        return {
            ...weeklyTotals,
            initialBalancePesos,
            initialBalanceDolares,
            finalBalancePesos:
                initialBalancePesos + weeklyTotals.totalIngresosPesos - weeklyTotals.totalEgresosPesos,
            finalBalanceDolares:
                initialBalanceDolares + weeklyTotals.totalIngresosDolares - weeklyTotals.totalEgresosDolares
        };
    }, [weeklyRecords, computedInitialBalances]);

    // Carga movimientos desde API
    useEffect(() => {
        if (!isAuthenticated()) {
            navigate('/login', { replace: true });
            return;
        }

        async function loadHomeData() {
            try {
                setIsLoading(true);
                setApiError('');

                const data = await getMovements();
                setRecords(data);

                // Si la semana actual no tiene datos, muestra automáticamente la última semana con movimientos.
                const currentWeekHasRecords = data.some((record) => {
                    const info = getISOWeekInfo(record.fecha);
                    return (
                        record.tipo !== 'cancelado' &&
                        info.year === currentWeek.year &&
                        info.week === currentWeek.week
                    );
                });

                if (!currentWeekHasRecords) {
                    const latestWeekWithRecords = getLatestWeekWithRecords(data);

                    if (latestWeekWithRecords) {
                        setPeriod(latestWeekWithRecords.year);
                        setWeek(latestWeekWithRecords.week);
                        loadStartingBalances(latestWeekWithRecords.year, latestWeekWithRecords.week);
                    }
                }
            } catch (error) {
                setApiError(error.message || 'No se pudieron cargar los movimientos.');
            } finally {
                setIsLoading(false);
            }
        }

        loadHomeData();
    }, [navigate, currentWeek.year, currentWeek.week, loadStartingBalances]);

    // Estilos globales para esta vista
    useEffect(() => {
        document.body.classList.remove('login-page', 'pagina-reportes', 'modo-egreso');
        document.body.classList.add('pagina-dashboard', 'modo-ingreso');

        return () => {
            document.body.classList.remove('pagina-dashboard', 'modo-ingreso');
        };
    }, []);

    // Guarda únicamente el saldo manual de la primera semana de trabajo.
    // Las semanas siguientes se calculan automáticamente con el saldo final anterior.
    useEffect(() => {
        if (computedInitialBalances.isAutomatic) return;

        localStorage.setItem(
            `snoopyProject2SaldoInicialPesos_${period}_${selectedWeek}`,
            manualStartingBalancePesos || '0'
        );

        localStorage.setItem(
            `snoopyProject2SaldoInicialDolares_${period}_${selectedWeek}`,
            manualStartingBalanceDolares || '0'
        );
    }, [
        period,
        selectedWeek,
        manualStartingBalancePesos,
        manualStartingBalanceDolares,
        computedInitialBalances.isAutomatic
    ]);

    // Propósito: exportar a Excel los registros visibles con el resumen insertado como imagen.
    const exportVisibleWeeklyRecords = async () => {
        const weekText = getWeekLabel(Number(period), Number(selectedWeek));
        const fileSafeWeek = `semana_${String(selectedWeek).padStart(2, '0')}_${period}`;

        const summarySections = [
            {
                title: 'INICIO SEMANA',
                dollars: renderCurrencyAmount(totals.initialBalanceDolares, 'dolares'),
                pesos: renderCurrencyAmount(totals.initialBalancePesos, 'pesos'),
                isFinal: false
            },
            {
                title: 'TOTAL INGRESOS',
                dollars: renderCurrencyAmount(totals.totalIngresosDolares, 'dolares'),
                pesos: renderCurrencyAmount(totals.totalIngresosPesos, 'pesos'),
                isFinal: false
            },
            {
                title: 'TOTAL EGRESOS',
                dollars: renderCurrencyAmount(totals.totalEgresosDolares, 'dolares'),
                pesos: renderCurrencyAmount(totals.totalEgresosPesos, 'pesos'),
                isFinal: false
            },
            {
                title: 'QUEDÓ EN CAJA',
                dollars: renderCurrencyAmount(totals.finalBalanceDolares, 'dolares'),
                pesos: renderCurrencyAmount(totals.finalBalancePesos, 'pesos'),
                isFinal: true
            }
        ];

        await downloadExcelWithSummaryImage({
            sheetName: 'Control semanal',
            fileName: `control_semanal_${fileSafeWeek}`,
            weekText,
            summarySections,
            cashRows,
            totals
        });
    };

    return (
        <>
            <Header activePage="inicio" />

            <main className="page-wrapper">
                <section className="page-header screenshot-style-header">
                    <div>
                        <h1>Inicio</h1>
                        <p>Control semanal tipo Excel de caja chica, ingresos, egresos e importe que quedó en caja por moneda.</p>
                    </div>
                </section>

                <section className="home-summary-grid">
                    <div className="home-summary-card">
                        <span>Inicio Semana</span>
                        <div className="home-currency-summary">
                            <div>
                                <small>Dólares</small>
                                <strong>{renderCurrencyAmount(totals.initialBalanceDolares, 'dolares')}</strong>
                            </div>
                            <div>
                                <small>Pesos</small>
                                <strong>{renderCurrencyAmount(totals.initialBalancePesos, 'pesos')}</strong>
                            </div>
                        </div>
                    </div>

                    <div className="home-summary-card income">
                        <span>Total ingresos</span>
                        <div className="home-currency-summary">
                            <div>
                                <small>Dólares</small>
                                <strong>{renderCurrencyAmount(totals.totalIngresosDolares, 'dolares')}</strong>
                            </div>
                            <div>
                                <small>Pesos</small>
                                <strong>{renderCurrencyAmount(totals.totalIngresosPesos, 'pesos')}</strong>
                            </div>
                        </div>
                    </div>

                    <div className="home-summary-card expense">
                        <span>Total egresos</span>
                        <div className="home-currency-summary">
                            <div>
                                <small>Dólares</small>
                                <strong>{renderCurrencyAmount(totals.totalEgresosDolares, 'dolares')}</strong>
                            </div>
                            <div>
                                <small>Pesos</small>
                                <strong>{renderCurrencyAmount(totals.totalEgresosPesos, 'pesos')}</strong>
                            </div>
                        </div>
                    </div>

                    <div className="home-summary-card final">
                        <span>Quedó en caja</span>
                        <div className="home-currency-summary">
                            <div>
                                <small>Dólares</small>
                                <strong>{renderCurrencyAmount(totals.finalBalanceDolares, 'dolares')}</strong>
                            </div>
                            <div>
                                <small>Pesos</small>
                                <strong>{renderCurrencyAmount(totals.finalBalancePesos, 'pesos')}</strong>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="card home-excel-card">
                    <div className="home-control-header home-control-header-fields-only">
                        <div className="home-control-intro home-control-intro-weekly">
                            <div className="home-control-intro-text">
                                <div className="home-control-title-row">
                                    <h2>Control semanal</h2>
                                </div>
                            </div>
                        </div>

                        <div className="home-filters-row home-control-fields-grid">
                            <div className="filter-box home-filter-card">
                                <label htmlFor="homePeriodo">Periodo</label>
                                <select
                                    id="homePeriodo"
                                    className="filter-control"
                                    value={period}
                                    onChange={(event) => {
                                        const nextYear = event.target.value;
                                        const maxWeek = getMaxAllowedWeekForYear(Number(nextYear), records);

                                        setPeriod(nextYear);
                                        setWeek(String(maxWeek));
                                        loadStartingBalances(nextYear, maxWeek);
                                    }}
                                >
                                    {years.map((year) => (
                                        <option key={year} value={year}>{year}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="filter-box home-filter-card home-week-card">
                                <label htmlFor="homeSemana">Semana</label>
                                <select
                                    id="homeSemana"
                                    className="filter-control"
                                    value={selectedWeek}
                                    onChange={(event) => {
                                        const nextWeek = event.target.value;
                                        setWeek(nextWeek);
                                        loadStartingBalances(period, nextWeek);
                                    }}
                                >
                                    {weeks.map((itemWeek) => (
                                        <option key={itemWeek} value={itemWeek}>
                                            {getWeekLabel(Number(period), itemWeek)}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="filter-box home-filter-card home-money-card">
                                <label htmlFor="startingBalanceDolares">Inicio Semana dólares</label>
                                <input
                                    id="startingBalanceDolares"
                                    className="filter-control"
                                    type="text"
                                    inputMode="decimal"
                                    value={formatBalanceInputValue(
                                        computedInitialBalances.isAutomatic
                                            ? computedInitialBalances.dolares
                                            : manualStartingBalanceDolares
                                    )}
                                    disabled={computedInitialBalances.isAutomatic}
                                    onChange={(event) => {
                                        setManualStartingBalanceDolares(cleanBalanceInputValue(event.target.value));
                                    }}
                                />
                                <small>USD</small>
                            </div>

                            <div className="filter-box home-filter-card home-money-card">
                                <label htmlFor="startingBalancePesos">Inicio Semana pesos</label>
                                <input
                                    id="startingBalancePesos"
                                    className="filter-control"
                                    type="text"
                                    inputMode="decimal"
                                    value={formatBalanceInputValue(
                                        computedInitialBalances.isAutomatic
                                            ? computedInitialBalances.pesos
                                            : manualStartingBalancePesos
                                    )}
                                    disabled={computedInitialBalances.isAutomatic}
                                    onChange={(event) => {
                                        setManualStartingBalancePesos(cleanBalanceInputValue(event.target.value));
                                    }}
                                />
                                <small>MXN</small>
                            </div>
                        </div>
                    </div>
                    <div className="home-table-panel">
                        <div className="home-table-actions-row">
                            <span className="home-table-actions-title">Registros mostrados</span>

                            <button
                                type="button"
                                className="btn-icon-action btn-export-row home-weekly-export-icon"
                                onClick={exportVisibleWeeklyRecords}
                                disabled={isLoading || Boolean(apiError)}
                                title="Exportar registros visibles"
                                aria-label="Exportar registros visibles"
                            >
                                <span className="material-icons-outlined">download</span>
                            </button>
                        </div>

                        <div className="table-wrapper home-table-wrapper">
                            <table className="home-excel-table">
                                <thead>
                                    <tr>
                                        <th rowSpan="2">Fecha</th>
                                        <th rowSpan="2">Folio</th>
                                        <th rowSpan="2">Descripción</th>
                                        <th colSpan="2" className="home-th-income">Ingreso</th>
                                        <th colSpan="2" className="home-th-expense">Egreso</th>
                                        <th colSpan="2" className="home-th-balance">Quedó en caja</th>
                                    </tr>
                                    <tr className="home-currency-head">
                                        <th>Dólares</th>
                                        <th>Pesos</th>
                                        <th>Dólares</th>
                                        <th>Pesos</th>
                                        <th>Dólares</th>
                                        <th>Pesos</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan="9" className="home-empty-row">
                                                Cargando movimientos...
                                            </td>
                                        </tr>
                                    ) : apiError ? (
                                        <tr>
                                            <td colSpan="9" className="home-empty-row">
                                                {apiError}
                                            </td>
                                        </tr>
                                    ) : cashRows.length === 1 ? (
                                        <>
                                            {cashRows.map((row) => (
                                                <tr key={row.id} className="home-row-initial">
                                                    <td>{formatShortDate(row.fecha)}</td>
                                                    <td>{row.folio}</td>
                                                    <td>{row.descripcion}</td>
                                                    <td>--</td>
                                                    <td>--</td>
                                                    <td>--</td>
                                                    <td>--</td>
                                                    <td>{renderCurrencyAmount(row.saldoDolares, 'dolares')}</td>
                                                    <td>{renderCurrencyAmount(row.saldoPesos, 'pesos')}</td>
                                                </tr>
                                            ))}

                                            <tr>
                                                <td colSpan="9" className="home-empty-row">
                                                    No hay ingresos ni egresos registrados en esta semana.
                                                </td>
                                            </tr>
                                        </>
                                    ) : (
                                        cashRows.map((row) => (
                                            <tr
                                                key={row.id}
                                                className={
                                                    row.rowType === 'initial'
                                                        ? 'home-row-initial'
                                                        : row.rowType === 'ingreso'
                                                            ? 'home-row-ingreso'
                                                            : 'home-row-egreso'
                                                }
                                            >
                                                <td>{formatShortDate(row.fecha)}</td>
                                                <td>{row.folio}</td>
                                                <td>{row.descripcion}</td>
                                                <td>{renderMovementAmount(row.ingresoDolares, 'dolares')}</td>
                                                <td>{renderMovementAmount(row.ingresoPesos, 'pesos')}</td>
                                                <td>{renderMovementAmount(row.egresoDolares, 'dolares')}</td>
                                                <td>{renderMovementAmount(row.egresoPesos, 'pesos')}</td>
                                                <td>{renderCurrencyAmount(row.saldoDolares, 'dolares')}</td>
                                                <td>{renderCurrencyAmount(row.saldoPesos, 'pesos')}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>

                                <tfoot>
                                    <tr>
                                        <td colSpan="3">Totales de la semana</td>
                                        <td>{renderCurrencyAmount(totals.totalIngresosDolares, 'dolares')}</td>
                                        <td>{renderCurrencyAmount(totals.totalIngresosPesos, 'pesos')}</td>
                                        <td>{renderCurrencyAmount(totals.totalEgresosDolares, 'dolares')}</td>
                                        <td>{renderCurrencyAmount(totals.totalEgresosPesos, 'pesos')}</td>
                                        <td>{renderCurrencyAmount(totals.finalBalanceDolares, 'dolares')}</td>
                                        <td>{renderCurrencyAmount(totals.finalBalancePesos, 'pesos')}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </section>
            </main>
        </>
    );
}

export default Home;
