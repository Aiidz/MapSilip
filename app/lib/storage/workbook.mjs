import { buildZip } from './zip.mjs';

const encoder = new TextEncoder();
const xml = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const display = value => value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
const title = value => value.replaceAll('_', ' ').replace(/\b\w/g, letter => letter.toUpperCase());
function columnName(index) {
  let name = '';
  for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name;
  return name;
}

/** Inline strings keep user-provided text from executing as Excel formulas. */
function workbookParts(name, rows, report) {
  const keys = report?.columns ?? [...new Set(rows.flatMap(row => Object.keys(row)))];
  const metrics = report?.metrics ?? [];
  const headerRow = metrics.length ? 8 : report ? 6 : 1;
  const columns = keys.flatMap(key => {
    const count = rows.reduce((max, row) => Math.max(max, Math.ceil(display(row[key]).length / 32000)), 1);
    return Array.from({ length: count }, (_, part) => ({ key, part, label: (report ? key : title(key)) + (part ? ` (continued ${part + 1})` : '') }));
  });
  if (!columns.length) columns.push({ key: 'message', part: 0, label: 'No records' });
  if (columns.length > 16384 || rows.length + headerRow > 1048576) throw Error('Excel size limit reached. Export a smaller selection.');
  const cell = (value, ref, style = 0) => typeof value === 'number' && Number.isFinite(value)
    ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
    : `<c r="${ref}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(display(value))}</t></is></c>`;
  const heading = `<row r="${headerRow}" ht="28" customHeight="1">${columns.map((col, i) => cell(col.label, `${columnName(i)}${headerRow}`, 1)).join('')}</row>`;
  const data = rows.map((row, index) => `<row r="${index + headerRow + 1}">${columns.map((col, i) => {
    const value = row[col.key];
    return cell(typeof value === 'number' && col.part === 0 ? value : display(value).slice(col.part * 32000, (col.part + 1) * 32000), `${columnName(i)}${index + headerRow + 1}`, typeof value === 'number' && report?.money?.includes(col.key) ? 2 : 0);
  }).join('')}</row>`).join('');
  const lastColumn = columnName(columns.length - 1);
  const sheetEnd = columnName(Math.max(columns.length, metrics.length) - 1);
  const range = `A${headerRow}:${lastColumn}${rows.length + headerRow}`;
  const intro = report ? [
    [name.toUpperCase(), 3],
    ['MapSilip · ' + report.period, 0],
    ['Generated ' + report.generated, 0],
    [report.summary ?? rows.length + ' records', 0],
  ].map(([value, style], index) => `<row r="${index + 1}"${index === 0 ? ' ht="30" customHeight="1"' : ''}>${cell(value, 'A' + (index + 1), style)}</row>`).join('') : '';
  const metricRows = metrics.length
    ? `<row r="5" ht="24" customHeight="1">${metrics.map((metric, index) => cell(metric.label, columnName(index) + '5', 4)).join('')}</row>
       <row r="6" ht="${report.emphasizeMetrics ? 34 : 22}" customHeight="1">${metrics.map((metric, index) => cell(metric.value, columnName(index) + '6', report.emphasizeMetrics ? (metric.money ? 5 : 6) : metric.money ? 2 : 0)).join('')}</row>`
    : '';
  const merges = report && sheetEnd !== 'A'
    ? '<mergeCells count="4">' + [1, 2, 3, 4].map(row => `<mergeCell ref="A${row}:${sheetEnd}${row}"/>`).join('') + '</mergeCells>' : '';
  const links = report?.rowLinks?.length
    ? '<hyperlinks>' + report.rowLinks.map((target, index) =>
      `<hyperlink ref="A${headerRow + index + 1}" location="${xml("'" + target.replaceAll("'", "''") + "'!A1")}"/>`).join('') + '</hyperlinks>'
    : '';
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${main}" xmlns:r="${office}"><sheets><sheet name="${xml(name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Records')}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${office}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<styleSheet xmlns="${main}"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0.00"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FF943333"/><sz val="18"/><name val="Calibri"/></font><font><b/><color rgb="FF27343E"/><sz val="20"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF27343E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF9EAE8"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/><xf numFmtId="164" fontId="3" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${main}"><dimension ref="A1:${sheetEnd}${rows.length + headerRow}"/><sheetViews><sheetView workbookViewId="0" showGridLines="${report ? 0 : 1}"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columns.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${report?.widths?.[col.key] ?? (/description|note|address/i.test(col.key) ? 48 : /id|date|created|updated/i.test(col.key) ? 28 : 22)}" customWidth="1"/>`).join('')}${metrics.length > columns.length ? `<col min="${columns.length + 1}" max="${metrics.length}" width="23" customWidth="1"/>` : ''}</cols><sheetData>${intro}${metricRows}${heading}${data}</sheetData><autoFilter ref="${range}"/>${merges}${links}</worksheet>`,
  };
  return files;
}

export function buildWorkbook(name, rows, report) {
  return buildWorkbooks([{ name, rows, report }]);
}

export function buildWorkbooks(sheets) {
  const files = workbookParts(sheets[0].name, sheets[0].rows, sheets[0].report);
  const firstSheet = files['xl/workbook.xml'].match(/<sheet name="[^"]*"/)[0];
  const sheetNames = [firstSheet + ' sheetId="1" r:id="rId1"/>'];
  for (const [index, sheet] of sheets.slice(1).entries()) {
    const id = index + 2;
    const parts = workbookParts(sheet.name, sheet.rows, sheet.report);
    const name = parts['xl/workbook.xml'].match(/<sheet name="[^"]*"/)[0];
    sheetNames.push(name + ` sheetId="${id}" r:id="rId${id + 1}"/>`);
    files[`xl/worksheets/sheet${id}.xml`] = parts['xl/worksheets/sheet1.xml'];
    files['[Content_Types].xml'] = files['[Content_Types].xml'].replace('</Types>',
      `<Override PartName="/xl/worksheets/sheet${id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);
    files['xl/_rels/workbook.xml.rels'] = files['xl/_rels/workbook.xml.rels'].replace('</Relationships>',
      `<Relationship Id="rId${id + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/></Relationships>`);
  }
  files['xl/workbook.xml'] = files['xl/workbook.xml'].replace(/<sheets>.*<\/sheets>/, () => '<sheets>' + sheetNames.join('') + '</sheets>');
  return buildZip(Object.entries(files).map(([name, content]) => ({ name, bytes: encoder.encode(content) })));
}
