// Archivo: src/utils/excel.js
// Propósito: exportar filas visibles a un archivo .xlsx real para evitar advertencias de Excel.

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function sanitizeSheetName(value) {
  const cleanName = String(value || 'Reporte')
    .replace(/[\\/?*:[\]]/g, ' ')
    .trim()
    .slice(0, 31);

  return cleanName || 'Reporte';
}

function getExcelColumnName(columnIndex) {
  let columnNumber = columnIndex + 1;
  let columnName = '';

  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    columnName = String.fromCharCode(65 + remainder) + columnName;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }

  return columnName;
}

function getColumnWidth(header) {
  const normalizedHeader = String(header || '').toLowerCase();

  if (normalizedHeader.includes('concepto') || normalizedHeader.includes('descripción')) {
    return 34;
  }

  if (normalizedHeader.includes('nombre')) {
    return 24;
  }

  if (normalizedHeader.includes('fecha')) {
    return 14;
  }

  if (normalizedHeader.includes('folio')) {
    return 16;
  }

  if (normalizedHeader.includes('dólares') || normalizedHeader.includes('dolares') || normalizedHeader.includes('pesos')) {
    return 18;
  }

  return 12;
}

function isMoneyColumn(header) {
  const normalizedHeader = String(header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return ['dolares', 'pesos', 'monto', 'cantidad', 'saldo', 'total'].some((word) =>
    normalizedHeader.includes(word),
  );
}

function isNumericColumn(header) {
  const normalizedHeader = String(header || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return normalizedHeader === 'sem' || normalizedHeader === 'semana' || isMoneyColumn(header);
}

function parseNumberValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const normalizedValue = String(value ?? '')
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();

  if (!normalizedValue || normalizedValue === '--' || normalizedValue === '-') {
    return null;
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalizedValue)) {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function createCellXml({ rowIndex, columnIndex, value, header, isHeader = false }) {
  const cellReference = `${getExcelColumnName(columnIndex)}${rowIndex}`;

  if (isHeader) {
    return `<c r="${cellReference}" t="inlineStr" s="1"><is><t>${escapeXml(value)}</t></is></c>`;
  }

  const numericValue = isNumericColumn(header) ? parseNumberValue(value) : null;

  if (numericValue !== null) {
    const styleId = isMoneyColumn(header) ? 3 : 2;
    return `<c r="${cellReference}" s="${styleId}"><v>${numericValue}</v></c>`;
  }

  const safeValue = value === null || value === undefined ? '' : String(value);
  const styleId = String(header || '').toLowerCase().includes('concepto') ? 4 : 2;

  return `<c r="${cellReference}" t="inlineStr" s="${styleId}"><is><t xml:space="preserve">${escapeXml(safeValue)}</t></is></c>`;
}

function createRowXml(rowIndex, cells, headers, isHeader = false) {
  const cellXml = cells
    .map((value, columnIndex) =>
      createCellXml({
        rowIndex,
        columnIndex,
        value,
        header: headers[columnIndex],
        isHeader,
      }),
    )
    .join('');

  return `<row r="${rowIndex}">${cellXml}</row>`;
}

function buildWorksheetXml({ rows, headers }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const columnXml = safeHeaders
    .map((header, index) => {
      const columnNumber = index + 1;
      return `<col min="${columnNumber}" max="${columnNumber}" width="${getColumnWidth(header)}" customWidth="1"/>`;
    })
    .join('');

  const tableRows = [
    createRowXml(1, safeHeaders, safeHeaders, true),
    ...safeRows.map((row, index) => createRowXml(index + 2, row, safeHeaders, false)),
  ].join('\n    ');

  const lastColumn = getExcelColumnName(Math.max(safeHeaders.length - 1, 0));
  const lastRow = Math.max(safeRows.length + 1, 1);
  const autoFilterRef = safeHeaders.length ? `A1:${lastColumn}${lastRow}` : 'A1:A1';

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews>
    <sheetView workbookViewId="0">
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A2" sqref="A2"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${columnXml}</cols>
  <sheetData>
    ${tableRows}
  </sheetData>
  <autoFilter ref="${autoFilterRef}"/>
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function buildStylesXml(headerColor) {
  const fillColor = String(headerColor || '#D9EAD3').replace('#', '').toUpperCase();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1">
    <numFmt numFmtId="164" formatCode="$#,##0.00"/>
  </numFmts>
  <fonts count="2">
    <font><sz val="11"/><color rgb="FF222222"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><color rgb="FF111111"/><name val="Calibri"/></font>
  </fonts>
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF${fillColor}"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFB7B7B7"/></left>
      <right style="thin"><color rgb="FFB7B7B7"/></right>
      <top style="thin"><color rgb="FFB7B7B7"/></top>
      <bottom style="thin"><color rgb="FFB7B7B7"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment vertical="center"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildWorkbookXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function buildWorkbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function buildRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildContentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildCorePropertiesXml() {
  const currentDate = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>Snoopy Project 2</dc:creator>
  <cp:lastModifiedBy>Snoopy Project 2</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${currentDate}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${currentDate}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppPropertiesXml(sheetName) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Snoopy Project 2</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>1</vt:i4></vt:variant></vt:vector></HeadingPairs>
  <TitlesOfParts><vt:vector size="1" baseType="lpstr"><vt:lpstr>${escapeXml(sheetName)}</vt:lpstr></vt:vector></TitlesOfParts>
</Properties>`;
}

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let current = index;

    for (let bit = 0; bit < 8; bit += 1) {
      current = current & 1 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }

    table[index] = current >>> 0;
  }

  return table;
}

const crc32Table = createCrc32Table();

function calculateCrc32(bytes) {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = crc32Table[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(target, offset, value) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function concatByteArrays(parts) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });

  return output;
}

function createZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const fileNameBytes = encoder.encode(file.name);
    const contentBytes = file.bytes ?? encoder.encode(file.content ?? '');
    const crc = calculateCrc32(contentBytes);
    const localHeader = new Uint8Array(30 + fileNameBytes.length);

    writeUint32(localHeader, 0, 0x04034b50);
    writeUint16(localHeader, 4, 20);
    writeUint16(localHeader, 6, 0);
    writeUint16(localHeader, 8, 0);
    writeUint16(localHeader, 10, 0);
    writeUint16(localHeader, 12, 0);
    writeUint32(localHeader, 14, crc);
    writeUint32(localHeader, 18, contentBytes.length);
    writeUint32(localHeader, 22, contentBytes.length);
    writeUint16(localHeader, 26, fileNameBytes.length);
    writeUint16(localHeader, 28, 0);
    localHeader.set(fileNameBytes, 30);

    localParts.push(localHeader, contentBytes);

    const centralHeader = new Uint8Array(46 + fileNameBytes.length);
    writeUint32(centralHeader, 0, 0x02014b50);
    writeUint16(centralHeader, 4, 20);
    writeUint16(centralHeader, 6, 20);
    writeUint16(centralHeader, 8, 0);
    writeUint16(centralHeader, 10, 0);
    writeUint16(centralHeader, 12, 0);
    writeUint16(centralHeader, 14, 0);
    writeUint32(centralHeader, 16, crc);
    writeUint32(centralHeader, 20, contentBytes.length);
    writeUint32(centralHeader, 24, contentBytes.length);
    writeUint16(centralHeader, 28, fileNameBytes.length);
    writeUint16(centralHeader, 30, 0);
    writeUint16(centralHeader, 32, 0);
    writeUint16(centralHeader, 34, 0);
    writeUint16(centralHeader, 36, 0);
    writeUint32(centralHeader, 38, 0);
    writeUint32(centralHeader, 42, offset);
    centralHeader.set(fileNameBytes, 46);

    centralParts.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  });

  const centralDirectory = concatByteArrays(centralParts);
  const localData = concatByteArrays(localParts);
  const endRecord = new Uint8Array(22);

  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, files.length);
  writeUint16(endRecord, 10, files.length);
  writeUint32(endRecord, 12, centralDirectory.length);
  writeUint32(endRecord, 16, localData.length);
  writeUint16(endRecord, 20, 0);

  return concatByteArrays([localData, centralDirectory, endRecord]);
}

export function exportRowsToExcelXml({ rows, sheetName, fileName, headers, headerColor }) {
  const safeSheetName = sanitizeSheetName(sheetName);
  const safeFileName = String(fileName || 'reporte').replace(/\.xlsx$/i, '');
  const safeRows = Array.isArray(rows) ? rows : [];
  const safeHeaders = Array.isArray(headers) ? headers : [];

  const files = [
    { name: '[Content_Types].xml', content: buildContentTypesXml() },
    { name: '_rels/.rels', content: buildRootRelsXml() },
    { name: 'docProps/core.xml', content: buildCorePropertiesXml() },
    { name: 'docProps/app.xml', content: buildAppPropertiesXml(safeSheetName) },
    { name: 'xl/workbook.xml', content: buildWorkbookXml(safeSheetName) },
    { name: 'xl/_rels/workbook.xml.rels', content: buildWorkbookRelsXml() },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: buildWorksheetXml({ rows: safeRows, headers: safeHeaders }),
    },
    { name: 'xl/styles.xml', content: buildStylesXml(headerColor) },
  ];

  const zipBytes = createZip(files);
  const blob = new Blob([zipBytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${safeFileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
