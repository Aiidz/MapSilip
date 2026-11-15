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
export function buildWorkbook(name, rows) {
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const columns = keys.flatMap(key => {
    const count = Math.max(1, ...rows.map(row => Math.ceil(display(row[key]).length / 32000)));
    return Array.from({ length: count }, (_, part) => ({ key, part, label: title(key) + (part ? ` (continued ${part + 1})` : '') }));
  });
  if (!columns.length) columns.push({ key: 'message', part: 0, label: 'No records' });
  if (columns.length > 16384 || rows.length > 1048575) throw Error('Excel size limit reached. Export a smaller selection.');
  const cell = (value, ref, header = false) => typeof value === 'number' && Number.isFinite(value)
    ? `<c r="${ref}"><v>${value}</v></c>`
    : `<c r="${ref}" t="inlineStr" s="${header ? 1 : 0}"><is><t xml:space="preserve">${xml(display(value))}</t></is></c>`;
  const heading = `<row r="1" ht="28" customHeight="1">${columns.map((col, i) => cell(col.label, `${columnName(i)}1`, true)).join('')}</row>`;
  const data = rows.map((row, index) => `<row r="${index + 2}">${columns.map((col, i) => {
    const value = row[col.key];
    return cell(typeof value === 'number' && col.part === 0 ? value : display(value).slice(col.part * 32000, (col.part + 1) * 32000), `${columnName(i)}${index + 2}`);
  }).join('')}</row>`).join('');
  const range = `A1:${columnName(columns.length - 1)}${rows.length + 1}`;
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<workbook xmlns="${main}" xmlns:r="${office}"><sheets><sheet name="${xml(name.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Records')}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<Relationships xmlns="${relationships}"><Relationship Id="rId1" Type="${office}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${office}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `<styleSheet xmlns="${main}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF27343E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    'xl/worksheets/sheet1.xml': `<worksheet xmlns="${main}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${columns.map((col, i) => `<col min="${i + 1}" max="${i + 1}" width="${/description|note|address/.test(col.key) ? 48 : /id|date|created|updated/.test(col.key) ? 28 : 22}" customWidth="1"/>`).join('')}</cols><sheetData>${heading}${data}</sheetData><autoFilter ref="${range}"/></worksheet>`,
  };
  return buildZip(Object.entries(files).map(([name, content]) => ({ name, bytes: encoder.encode(content) })));
}
