import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buildWorkbook } from '../app/lib/storage/workbook.mjs';

test('Excel export has frozen headers, filters, numeric amounts and literal untrusted text', () => {
  const bytes = buildWorkbook('Payments', [{ tenant_name: 'Maria & Co', amount: 3000, reference_number: '001234', note: '=HYPERLINK("https://example.com")', optional: null }]);
  const result = spawnSync('python3', ['-c', `
import sys,io,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
assert z.testzip() is None
for name in z.namelist(): E.fromstring(z.read(name))
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
root=E.fromstring(z.read('xl/worksheets/sheet1.xml'))
assert root.find('.//m:pane',ns).get('state')=='frozen'
assert root.find('m:autoFilter',ns) is not None
assert not root.findall('.//m:f',ns)
cells=root.findall('.//m:row',ns)[1].findall('m:c',ns)
assert cells[0].find('.//m:t',ns).text=='Maria & Co'
assert cells[1].find('m:v',ns).text=='3000'
assert cells[2].find('.//m:t',ns).text=='001234'
assert cells[3].find('.//m:t',ns).text.startswith('=HYPERLINK')
`], { input: bytes });
  assert.equal(result.status, 0, result.stderr.toString());
});

test('Excel keeps long text across continuation columns and removes invalid XML controls', () => {
  const value = 'a'.repeat(40000);
  const bytes = buildWorkbook('Maintenance', [{ description: value, note: 'Safe\u0000text' }]);
  const result = spawnSync('python3', ['-c', `
import sys,io,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
rows=E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row',ns)
values=[c.find('.//m:t',ns).text or '' for c in rows[1].findall('m:c',ns)]
assert values[0]+values[1]=='a'*40000
assert values[2]=='Safetext'
`], { input: bytes });
  assert.equal(result.status, 0, result.stderr.toString());
});

test('history report has a dated title block and a filterable financial table', () => {
  const bytes = buildWorkbook('Payment history', [{ 'Invoice ID': '001', Billed: 2500 }], {
    columns: ['Invoice ID', 'Billed'], period: 'All history', generated: 'Nov 20, 2026 (Manila)', money: ['Billed'],
  });
  const result = spawnSync('python3', ['-c', `
import sys,io,zipfile,xml.etree.ElementTree as E
z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
sheet=E.fromstring(z.read('xl/worksheets/sheet1.xml'))
assert sheet.find('m:autoFilter',ns).get('ref') == 'A6:B7'
assert sheet.find('.//m:pane',ns).get('topLeftCell') == 'A7'
assert sheet.find('.//m:c[@r="A1"]//m:t',ns).text == 'PAYMENT HISTORY'
assert sheet.find('.//m:c[@r="B7"]',ns).get('s') == '2'
assert sheet.find('.//m:c[@r="B7"]/m:v',ns).text == '2500'
`], { input: bytes });
  assert.equal(result.status, 0, result.stderr.toString());
});
