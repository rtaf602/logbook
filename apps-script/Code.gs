/**
 * 602 LOG BOOK — ฐานข้อมูลหลังบ้าน (Google Apps Script)
 * ติดตั้งในไฟล์ "602DB_LOG BOOK ปีงบ70_ต้นทาง" (บัญชี ohomee.aviation@gmail.com)
 * ส่วนขยาย → Apps Script → วางไฟล์นี้ → เรียก setup() 1 ครั้ง → ทำให้ใช้งานได้ (Deploy) เป็น Web app
 *
 * ชีทในไฟล์นี้ (ชีทที่ 1 รายชื่อสนามบิน อยู่ในไฟล์แยก):
 *   2 ประวัติแก้ไข-ลบ · 3 602YEAR_LOG BOOK · 4 ชั่วโมงจัดสรร · 5 เครื่อง-รหัส-ภารกิจ · 6 อ่านก่อน
 */

// ======================= ตั้งค่า =======================
const CFG = {
  FY: 2570,                                                      // ปีงบของไฟล์นี้ (1 ต.ค.69 – 30 ก.ย.70)
  SHEET_ID: '1KpUmauu8c9acPEmNMOGWyBTzg8B2uNVb0DYAjE2_6dM',      // ไฟล์ต้นทาง (ไฟล์นี้)
  AIRPORT_SHEET_ID: '1desVWlj1x8E_05EP6rTa7Rj9CfjY6-t10SlB1DPUdrs', // ชีทที่ 1 รายชื่อสนามบิน
  BACKUP_FOLDER_ID: '1x6iMd_fcg5wcBnKlR-4k9zHF9PLoa1wv',         // โฟลเดอร์ 602DB_สำรองรายวัน
  BACKUP_KEEP_DAYS: 30,
  BACKUP_HOUR: 2,                                                // สำรองทุกคืนเวลาประมาณ 02:00
  // SHA-256 ของรหัส (ไม่เก็บรหัสจริงในโค้ด) — เปลี่ยนรหัส: ใส่ค่าใหม่ใน Script Properties ENTRY_HASH / ADMIN_HASH
  ENTRY_HASH: '2485cbb6668d679c127e0c0a59d474e991b31e2257a6e2f960027eb5fa3ec4a3',
  ADMIN_HASH: '9f2b75a5b90c42ba4b8386b6555db2ebda000f035a03c6120f9e725c8bde4280',
  TZ: 'Asia/Bangkok',
};
const SH = { HIST: '2 ประวัติแก้ไข-ลบ', LOG: '3 602YEAR_LOG BOOK', ALLOC: '4 ชั่วโมงจัดสรร', LISTS: '5 เครื่อง-รหัส-ภารกิจ', README: '6 อ่านก่อน' };
const HEAD_ROW = 4, FIRST = 5;   // แถวหัวตาราง / แถวข้อมูลแรก (แถว 1–2 เป็นชื่อชีทและคำอธิบาย)

const TYPE_TH = { dechochai: 'เดโชชัย', vip: 'บุคคลสำคัญ', training: 'ฝึกบิน' };
const TYPE_ID = { 'เดโชชัย': 'dechochai', 'บุคคลสำคัญ': 'vip', 'ฝึกบิน': 'training' };
const GROUP_NAME = { '15': 'บ.ล.๑๕/ก (AIRBUS 319 CJ/ACJ320)', '18': 'บ.ล.๑๘ (SSJ100LR)', '19': 'บ.ล.๑๙ (AIRBUS 340-500)' };
const CODE_GROUP = { 'บ.ล.15': '15', 'บ.ล.15ก': '15', 'บ.ล.18': '18', 'บ.ล.19': '19' };

// คอลัมน์ชีท 3 (ลำดับห้ามเปลี่ยน — เว็บและสคริปต์อ้างตำแหน่งนี้)
const LOG_COLS = [
  ['id', 'รหัสรายการ', 11], ['fy', 'ปีงบ', 7], ['ym', 'เดือน\n(ปี-เดือน)', 10], ['date', 'วันที่ภารกิจ', 12], ['type', 'ประเภท', 12],
  ['aircraft', 'แบบ บ.', 18], ['code', 'รหัส บ.ล.', 9], ['mission', 'ภารกิจ', 44], ['route', 'เส้นทาง', 30], ['scope', 'ใน/ต่างประเทศ', 11],
  ['flights', 'เที่ยวบิน', 8], ['flightsManual', 'เที่ยวบิน\nกรอกเอง', 9], ['hours', 'ชม.บิน', 8], ['pax', 'ผู้โดยสาร', 9], ['cargo', 'พัสดุ/กก.', 9],
  ['note', 'หมายเหตุ', 16], ['adminMsg', 'ข้อความถึง ADMIN', 18], ['unknownAirports', 'สนามบินที่ไม่มี\nในฐานข้อมูล', 16],
  ['recorder', 'ผู้บันทึก', 24], ['at', 'เวลาบันทึก', 16], ['editedByName', 'ผู้แก้ไขล่าสุด', 18], ['editedAt', 'เวลาแก้ไขล่าสุด', 16],
  ['airports', 'สนามบิน (สำหรับระบบ)', 30],
];
const LOGC = Object.fromEntries(LOG_COLS.map((c, i) => [c[0], i]));
const FIELD_TH = Object.fromEntries(LOG_COLS.map(c => [c[0], c[1].replace(/\n/g, ' ')]));
const HIST_COLS = ['ลำดับ', 'เวลาที่ทำรายการ\n(เวลาไทย)', 'การกระทำ', 'รหัสรายการ\n(อ้างอิงชีท 3)', 'วันที่ภารกิจ', 'แบบ บ.', 'ประเภท', 'ช่องที่เปลี่ยน', 'ค่าก่อน', 'ค่าหลัง', 'ผู้ทำรายการ', 'เหตุผล / หมายเหตุ'];
const ALLOC_COLS = ['ปีงบ', 'กลุ่ม', 'แบบ บ. (กลุ่ม)', 'รายการ', 'ชนิดชั่วโมง', 'ได้รับเดือนที่\n(1=ต.ค. … 11=ส.ค.)', 'ชั่วโมง\n(ต้นปี = ยอดทั้งปี\nRevise = เพิ่ม/ลด)', 'ผู้บันทึก', 'เวลาบันทึก', 'หมายเหตุ'];

// ======================= Web app =======================
function doGet() { return json_({ ok: true, service: '602 LOG BOOK', fy: CFG.FY, time: new Date().toISOString() }); }

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' }); }
  try {
    if (!checkHash_(req.key, prop_('ENTRY_HASH', CFG.ENTRY_HASH))) return json_({ ok: false, code: 'auth', error: 'รหัสเข้าใช้งานไม่ถูกต้อง' });
    const admin = () => { if (!checkHash_(req.admin, prop_('ADMIN_HASH', CFG.ADMIN_HASH))) throw httpErr_('auth', 'รหัส ADMIN ไม่ถูกต้อง'); };
    switch (req.action) {
      case 'entries': return json_({ ok: true, fy: CFG.FY, entries: readEntries_() });
      case 'save': return json_(withLock_(() => saveEntry_(req)));
      case 'delete': admin(); return json_(withLock_(() => deleteEntry_(req)));
      case 'alloc': return json_({ ok: true, alloc: readAlloc_() });
      case 'setAlloc': admin(); return json_(withLock_(() => writeAlloc_(req)));
      case 'lists': return json_({ ok: true, lists: readLists_() });
      case 'setLists': admin(); return json_(withLock_(() => writeLists_(req)));
      case 'airports': return json_({ ok: true, airports: readAirports_(!!req.refresh) });
      default: return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, code: err.code || 'error', error: String(err.message || err) });
  }
}

// ======================= ชีท 3: ภารกิจ =======================
function readEntries_() {
  const sh = sheet_(SH.LOG), last = sh.getLastRow();
  if (last < FIRST) return [];
  const vals = sh.getRange(FIRST, 1, last - FIRST + 1, LOG_COLS.length).getValues();
  return vals.filter(r => r[LOGC.id]).map(rowToEntry_);
}
function rowToEntry_(r) {
  const d = r[LOGC.date] instanceof Date ? r[LOGC.date] : null;
  let airports = [];
  try { airports = JSON.parse(r[LOGC.airports] || '[]'); } catch (e) { airports = String(r[LOGC.route] || '').split('-').filter(Boolean); }
  const num = v => (v === '' || v === null) ? null : +v;
  return {
    id: String(r[LOGC.id]),
    ym: String(r[LOGC.ym] || (d ? Utilities.formatDate(d, CFG.TZ, 'yyyy-MM') : '')),
    day: d ? +Utilities.formatDate(d, CFG.TZ, 'd') : null,
    type: TYPE_ID[r[LOGC.type]] || r[LOGC.type],
    aircraft: r[LOGC.aircraft], mission: r[LOGC.mission], airports, route: r[LOGC.route],
    scope: r[LOGC.scope] === 'ต่างประเทศ' ? 'international' : 'domestic',
    flights: num(r[LOGC.flights]), flightsManual: r[LOGC.flightsManual] === 'ใช่',
    hours: num(r[LOGC.hours]), pax: num(r[LOGC.pax]), cargo: num(r[LOGC.cargo]),
    note: r[LOGC.note] || '', adminMsg: r[LOGC.adminMsg] || '',
    unknownAirports: String(r[LOGC.unknownAirports] || '').split(',').map(s => s.trim()).filter(Boolean),
    recorder: r[LOGC.recorder] || '', at: iso_(r[LOGC.at]),
    editedByName: r[LOGC.editedByName] || '', editedAt: iso_(r[LOGC.editedAt]),
  };
}
function entryToRow_(e, codes) {
  const [y, m] = String(e.ym).split('-').map(Number);
  const row = new Array(LOG_COLS.length).fill('');
  row[LOGC.id] = e.id; row[LOGC.fy] = fyOf_(y, m); row[LOGC.ym] = "'" + e.ym;
  row[LOGC.date] = new Date(y, m - 1, +e.day); row[LOGC.type] = TYPE_TH[e.type] || e.type;
  row[LOGC.aircraft] = e.aircraft || ''; row[LOGC.code] = (codes || {})[e.aircraft] || '';
  row[LOGC.mission] = e.mission || ''; row[LOGC.route] = e.route || (e.airports || []).join('-');
  row[LOGC.scope] = e.scope === 'international' ? 'ต่างประเทศ' : 'ในประเทศ';
  row[LOGC.flights] = nz_(e.flights); row[LOGC.flightsManual] = e.flightsManual ? 'ใช่' : 'ไม่';
  row[LOGC.hours] = nz_(e.hours); row[LOGC.pax] = nz_(e.pax); row[LOGC.cargo] = nz_(e.cargo);
  row[LOGC.note] = e.note || ''; row[LOGC.adminMsg] = e.adminMsg || '';
  row[LOGC.unknownAirports] = (e.unknownAirports || []).join(', ');
  row[LOGC.recorder] = e.recorder || ''; row[LOGC.at] = e.at ? new Date(e.at) : new Date();
  row[LOGC.editedByName] = e.editedByName || ''; row[LOGC.editedAt] = e.editedAt ? new Date(e.editedAt) : '';
  row[LOGC.airports] = JSON.stringify(e.airports || []);
  return row;
}
function saveEntry_(req) {
  const e = Object.assign({}, req.data || {}); e.ym = req.ym || e.ym;
  if (!/^\d{4}-\d{2}$/.test(e.ym || '')) throw httpErr_('bad', 'เดือนไม่ถูกต้อง');
  const [y, m] = e.ym.split('-').map(Number);
  if (fyOf_(y, m) !== CFG.FY) throw httpErr_('bad', 'ไฟล์นี้รับเฉพาะปีงบ ' + CFG.FY);
  // ข้อ 23: ต้องกรอกครบ ยกเว้นหมายเหตุและข้อความถึง ADMIN
  const miss = [];
  if (!(+e.day >= 1 && +e.day <= 31)) miss.push('วันที่');
  if (!e.aircraft) miss.push('แบบ บ.'); if (!TYPE_TH[e.type]) miss.push('ประเภท');
  if (!String(e.mission || '').trim()) miss.push('ภารกิจ');
  if (!e.airports || e.airports.length < 2 || e.airports.some(a => !String(a).trim())) miss.push('เส้นทางบิน');
  if (!(+e.hours > 0)) miss.push('ชม.บิน'); if (e.pax == null || e.pax === '') miss.push('ผู้โดยสาร');
  if (e.cargo == null || e.cargo === '') miss.push('พัสดุ/กก.'); if (!(+e.flights > 0)) miss.push('เที่ยวบิน');
  if (!String(e.recorder || '').trim()) miss.push('ชื่อผู้บันทึกข้อมูล');
  if (miss.length) throw httpErr_('bad', 'กรอกข้อมูลไม่ครบ: ' + miss.join(', '));
  const codes = readLists_().codes, sh = sheet_(SH.LOG);
  const id = String(req.id || '');
  const at = id ? findRow_(sh, id) : 0;
  if (id && at) {                                   // แก้ไข → บันทึกประวัติทีละช่อง
    const oldRow = sh.getRange(at, 1, 1, LOG_COLS.length).getValues()[0], old = rowToEntry_(oldRow);
    e.id = id; e.recorder = old.recorder || e.recorder; e.at = old.at || e.at;
    e.editedByName = e.editedByName || e.recorder; e.editedAt = new Date().toISOString();
    const newRow = entryToRow_(e, codes);
    sh.getRange(at, 1, 1, newRow.length).setValues([newRow]); formatLogRow_(sh, at);
    const changes = diff_(old, e);
    const who = e.editedByName || '';
    changes.forEach(c => history_('แก้ไข', e, c.label, c.before, c.after, who, ''));
    return { ok: true, id, changes: changes.length };
  }
  e.id = id || newId_(); e.at = e.at || new Date().toISOString(); e.editedByName = ''; e.editedAt = '';
  const row = entryToRow_(e, codes), r = Math.max(sh.getLastRow() + 1, FIRST);
  sh.getRange(r, 1, 1, row.length).setValues([row]); formatLogRow_(sh, r);
  return { ok: true, id: e.id };
}
function deleteEntry_(req) {
  const sh = sheet_(SH.LOG), at = findRow_(sh, String(req.id || ''));
  if (!at) throw httpErr_('notfound', 'ไม่พบรายการ (อาจถูกลบไปแล้ว)');
  const old = rowToEntry_(sh.getRange(at, 1, 1, LOG_COLS.length).getValues()[0]);
  history_('ลบ', old, '(ทั้งรายการ)', JSON.stringify(old), '', req.byName || '', req.reason || '');
  sh.deleteRow(at);
  return { ok: true };
}
function diff_(a, b) {
  const keys = ['day', 'type', 'aircraft', 'mission', 'route', 'scope', 'flights', 'flightsManual', 'hours', 'pax', 'cargo', 'note', 'adminMsg'];
  const show = (k, v) => k === 'type' ? (TYPE_TH[v] || v) : k === 'scope' ? (v === 'international' ? 'ต่างประเทศ' : 'ในประเทศ') : k === 'flightsManual' ? (v ? 'ใช่' : 'ไม่') : (v == null ? '' : v);
  const label = k => k === 'day' ? 'วันที่' : FIELD_TH[k];
  return keys.filter(k => String(show(k, a[k])) !== String(show(k, b[k]))).map(k => ({ label: label(k), before: show(k, a[k]), after: show(k, b[k]) }));
}

// ======================= ชีท 2: ประวัติ =======================
function history_(action, e, field, before, after, who, why) {
  const sh = sheet_(SH.HIST), r = Math.max(sh.getLastRow() + 1, FIRST);
  const [y, m] = String(e.ym || '').split('-').map(Number);
  sh.getRange(r, 1, 1, HIST_COLS.length).setValues([[r - FIRST + 1, new Date(), action, e.id || '', (y && e.day) ? new Date(y, m - 1, +e.day) : '',
    e.aircraft || '', TYPE_TH[e.type] || e.type || '', field, String(before), String(after), who, why]]);
  sh.getRange(r, 2).setNumberFormat('d mmm yy hh:mm'); sh.getRange(r, 5).setNumberFormat('d mmm yy');
  sh.getRange(r, 1, 1, HIST_COLS.length).setFontFamily('TH SarabunPSK').setFontSize(15).setVerticalAlignment('middle').setWrap(true);
}

// ======================= ชีท 4: ชั่วโมงจัดสรร =======================
function readAlloc_() {
  const sh = sheet_(SH.ALLOC), last = sh.getLastRow();
  const out = { fy: CFG.FY, groups: {}, updatedByName: '', updatedAt: '' };
  if (last < FIRST) return out;
  sh.getRange(FIRST, 1, last - FIRST + 1, ALLOC_COLS.length).getValues().forEach(r => {
    if (+r[0] !== CFG.FY || !r[1]) return;
    const g = String(r[1]), kind = r[4] === 'ชม.ฝึกบิน' ? 'training' : 'total';
    const G = out.groups[g] = out.groups[g] || { total: null, training: null, revisions: [] };
    if (r[3] === 'ต้นปี') G[kind] = r[6] === '' ? null : +r[6];
    else if (r[3] === 'Revise' && r[5] !== '' && r[6] !== '') G.revisions.push({ kind, month: +r[5], add: +r[6] });
    if (r[8] instanceof Date && (!out.updatedAt || r[8] > new Date(out.updatedAt))) { out.updatedAt = r[8].toISOString(); out.updatedByName = r[7]; }
  });
  return out;
}
function writeAlloc_(req) {
  if (+req.fy !== CFG.FY) throw httpErr_('bad', 'ไฟล์นี้รับเฉพาะปีงบ ' + CFG.FY);
  const sh = sheet_(SH.ALLOC), groups = req.groups || {}, who = req.byName || '', now = new Date(), rows = [];
  ['15', '18', '19'].concat(Object.keys(groups).filter(k => !['15', '18', '19'].includes(k))).forEach(g => {
    const G = groups[g]; if (!G) return;
    rows.push([CFG.FY, g, GROUP_NAME[g] || g, 'ต้นปี', 'ชม.บินรวม', '', G.total == null ? '' : +G.total, who, now, '']);
    rows.push([CFG.FY, g, GROUP_NAME[g] || g, 'ต้นปี', 'ชม.ฝึกบิน', '', G.training == null ? '' : +G.training, who, now, '']);
    (G.revisions || []).forEach(rv => rows.push([CFG.FY, g, GROUP_NAME[g] || g, 'Revise', rv.kind === 'training' ? 'ชม.ฝึกบิน' : 'ชม.บินรวม', +rv.month, +rv.add, who, now, '']));
  });
  const before = JSON.stringify(readAlloc_().groups);
  const last = sh.getLastRow();
  if (last >= FIRST) sh.getRange(FIRST, 1, last - FIRST + 1, ALLOC_COLS.length).clearContent();
  if (rows.length) {
    sh.getRange(FIRST, 1, rows.length, ALLOC_COLS.length).setValues(rows);
    sh.getRange(FIRST, 7, rows.length, 1).setNumberFormat('#,##0.00'); sh.getRange(FIRST, 9, rows.length, 1).setNumberFormat('d mmm yy hh:mm');
    sh.getRange(FIRST, 1, rows.length, ALLOC_COLS.length).setFontFamily('TH SarabunPSK').setFontSize(16).setVerticalAlignment('middle');
  }
  history_('แก้ชั่วโมงจัดสรร', { id: 'ปีงบ ' + CFG.FY }, 'ชั่วโมงจัดสรร', before, JSON.stringify(groups), who, '');
  return { ok: true, rows: rows.length };
}

// ======================= ชีท 5: เครื่อง / รหัส / ภารกิจ =======================
function readLists_() {
  const sh = sheet_(SH.LISTS), last = Math.max(sh.getLastRow(), FIRST);
  const v = sh.getRange(FIRST, 1, last - FIRST + 1, 11).getValues();
  const aircraft = [], codes = {}, mission = [], route = [];
  v.forEach(r => {
    if (r[1]) { codes[r[1]] = r[2]; if (r[4] !== 'ไม่') aircraft.push(String(r[1])); }
    if (r[7]) mission.push(String(r[7]));
    if (r[10]) route.push(String(r[10]));
  });
  return { aircraft, codes, mission, route };
}
function writeLists_(req) {
  const L = req.lists || {}, sh = sheet_(SH.LISTS), last = sh.getLastRow();
  const old = readLists_();
  if (last >= FIRST) sh.getRange(FIRST, 1, last - FIRST + 1, 11).clearContent();
  const ac = (L.aircraft || []).slice(), codes = L.codes || {};
  // เครื่องที่ถูกเอาออกจากรายการ: เก็บไว้เป็น "ไม่" ใช้งาน (ข้อมูลเก่ายังอ้างถึง)
  Object.keys(old.codes).forEach(a => { if (!ac.includes(a)) ac.push('\u0000' + a); });
  const acRows = ac.map((a, i) => { const off = a[0] === '\u0000', name = off ? a.slice(1) : a, code = codes[name] || old.codes[name] || '';
    return [i + 1, name, code, CODE_GROUP[code] || '', off ? 'ไม่' : 'ใช่']; });
  if (acRows.length) sh.getRange(FIRST, 1, acRows.length, 5).setValues(acRows);
  const ms = (L.mission || []).map((m, i) => [i + 1, m]); if (ms.length) sh.getRange(FIRST, 7, ms.length, 2).setValues(ms);
  const rt = (L.route || []).map((m, i) => [i + 1, m]); if (rt.length) sh.getRange(FIRST, 10, rt.length, 2).setValues(rt);
  sh.getRange(FIRST, 1, Math.max(acRows.length, ms.length, rt.length, 1), 11).setFontFamily('TH SarabunPSK').setFontSize(16);
  history_('แก้รายการตัวเลือก', { id: 'ชีท 5' }, 'เครื่อง/รหัส/ภารกิจ', JSON.stringify(old), JSON.stringify(L), req.byName || '', '');
  return { ok: true };
}

// ======================= ชีทที่ 1: รายชื่อสนามบิน (ไฟล์แยก) =======================
function readAirports_(refresh) {
  const cache = CacheService.getScriptCache(), KEY = 'airports_v1';
  if (!refresh) { const c = getBig_(cache, KEY); if (c) return c; }
  const ss = SpreadsheetApp.openById(CFG.AIRPORT_SHEET_ID), items = [];
  const dom = ss.getSheetByName('ปลายทางจังหวัด+กองบิน');
  if (dom) dom.getDataRange().getValues().slice(1).forEach(r => {          // B จังหวัด · H IATA · I ICAO · J ข้อความแสดงผล
    const name = String(r[9] || '').trim(); if (!name) return;
    const prov = String(r[1] || '').trim();
    items.push([name, name === prov ? '' : prov, String(r[7] || '').trim(), 'd', String(r[8] || '').trim()]);
  });
  const intl = ss.getSheetByName('เมืองสนามบินนานาชาติ');
  if (intl) intl.getDataRange().getValues().slice(1).forEach(r => {         // C ประเทศ · J IATA · K ICAO · M ข้อความแสดงผล
    const name = String(r[12] || '').trim(); if (!name) return;
    items.push([name, String(r[2] || '').trim(), String(r[9] || '').trim(), 'i', String(r[10] || '').trim()]);
  });
  const out = { source: 'Google Sheet รายชื่อสนามบิน', fields: ['display', 'province/country', 'IATA', 'kind d|i', 'ICAO'], syncedAt: new Date().toISOString(), items };
  putBig_(cache, KEY, out, 3600);
  return out;
}

// ======================= สำรองรายวัน =======================
function dailyBackup() {
  const file = DriveApp.getFileById(CFG.SHEET_ID), folder = DriveApp.getFolderById(CFG.BACKUP_FOLDER_ID);
  const stamp = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HHmm');
  const prefix = file.getName() + '_สำรอง ';
  file.makeCopy(prefix + stamp, folder);
  const cutoff = Date.now() - CFG.BACKUP_KEEP_DAYS * 864e5, it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf(prefix) === 0 && f.getDateCreated().getTime() < cutoff) f.setTrashed(true); }
}
function installBackupTrigger_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyBackup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(CFG.BACKUP_HOUR).inTimezone(CFG.TZ).create();
}

// ======================= ติดตั้งครั้งแรก =======================
/** เรียกครั้งเดียวจากหน้า Apps Script: สร้างชีท 2–6, ใส่ข้อมูลปัจจุบัน (ถ้าชีทยังว่าง), ตั้งสำรองรายวัน */
function setup() {
  const ss = book_();
  ss.setSpreadsheetTimeZone(CFG.TZ);
  const mk = (name, title, sub, heads, widths) => {
    let sh = ss.getSheetByName(name); const fresh = !sh;
    if (!sh) sh = ss.insertSheet(name);
    if (fresh || !sh.getRange(HEAD_ROW, 1).getValue()) {
      sh.getRange(1, 1).setValue(title).setFontFamily('TH SarabunPSK').setFontSize(20).setFontWeight('bold').setFontColor('#1F3864');
      sh.getRange(2, 1).setValue(sub).setFontFamily('TH SarabunPSK').setFontSize(14).setFontColor('#595959').setBackground('#FFF2CC').setWrap(false);
      sh.getRange(HEAD_ROW, 1, 1, heads.length).setValues([heads]).setFontFamily('TH SarabunPSK').setFontSize(15).setFontWeight('bold')
        .setFontColor('#FFFFFF').setBackground('#1F3864').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
      sh.setRowHeight(HEAD_ROW, 64); sh.setRowHeight(1, 34);
      widths.forEach((w, i) => sh.setColumnWidth(i + 1, Math.round(w * 7.5)));
      sh.setFrozenRows(HEAD_ROW);
    }
    return sh;
  };
  const hist = mk(SH.HIST, 'ชีทที่ 2 · ประวัติการแก้ไขและการลบ', 'เว็บเขียนให้อัตโนมัติ · 1 แถว = 1 ช่องที่เปลี่ยน · การลบเก็บข้อมูลทั้งรายการไว้ในช่อง “ค่าก่อน” เพื่อกู้คืน · ห้ามแก้หรือลบแถวด้วยมือ',
    HIST_COLS, [7, 17, 14, 13, 12, 18, 12, 16, 40, 40, 24, 24]);
  const log = mk(SH.LOG, 'ชีทที่ 3 · 602YEAR_LOG BOOK ปีงบ ' + CFG.FY, '1 แถว = 1 ภารกิจ · เว็บเพิ่ม/แก้/ลบแถวให้ (จับคู่ด้วยรหัสรายการ) · ห้ามแก้ด้วยมือ · แบบฟอร์มรายเดือนและสรุปได้จากปุ่ม Export บนเว็บ',
    LOG_COLS.map(c => c[1]), LOG_COLS.map(c => c[2]));
  log.hideColumns(LOGC.airports + 1);
  log.getRange('C:C').setNumberFormat('@');
  const alloc = mk(SH.ALLOC, 'ชีทที่ 4 · ชั่วโมงจัดสรรต้นปีและ Revise (ADMIN DATA USING)', 'เว็บเขียนเมื่อกด “บันทึกชั่วโมงจัดสรร” · 1 แถว = ยอดต้นปี หรือ Revise 1 ครั้ง · Revise ลดชั่วโมงใส่ค่าลบ · ตารางสีเขียวขวามือเป็นสูตรตรวจดู เว็บไม่อ่าน',
    ALLOC_COLS, [8, 7, 30, 11, 13, 15, 18, 26, 17, 22]);
  alloc.getRange('L4:O4').setValues([['กลุ่ม', 'ชม.บินรวม\nทั้งปีหลัง Revise', 'ชม.ฝึกบิน\nทั้งปีหลัง Revise', 'ชม.ภารกิจ\n(รวม − ฝึก)']])
    .setFontFamily('TH SarabunPSK').setFontWeight('bold').setBackground('#E2EFDA').setWrap(true).setHorizontalAlignment('center');
  ['15', '18', '19'].forEach((g, i) => { const r = 5 + i;
    alloc.getRange(r, 12, 1, 4).setValues([[g, `=SUMIFS($G$5:$G$2000,$B$5:$B$2000,L${r},$E$5:$E$2000,"ชม.บินรวม")`, `=SUMIFS($G$5:$G$2000,$B$5:$B$2000,L${r},$E$5:$E$2000,"ชม.ฝึกบิน")`, `=M${r}-N${r}`]])
      .setBackground('#E2EFDA').setFontFamily('TH SarabunPSK').setFontSize(16).setNumberFormat('#,##0.00'); });
  alloc.getRange('L5:L7').setNumberFormat('@'); alloc.getRange('B:B').setNumberFormat('@');
  const lists = mk(SH.LISTS, 'ชีทที่ 5 · รายชื่อเครื่อง รหัส บ.ล. และรายชื่อภารกิจที่ใช้บ่อย', 'เว็บอ่านเมื่อเปิดหน้า และเขียนเมื่อ ADMIN บันทึกในหน้าตั้งค่า · เครื่องที่ปลดประจำการเปลี่ยน “ใช้งาน” เป็น ไม่ — อย่าลบแถว',
    ['ลำดับ', 'แบบ บ.\n(ชื่อที่แสดงในเว็บ)', 'รหัส บ.ล.', 'กลุ่มชั่วโมง\nจัดสรร', 'ใช้งาน', '', 'ลำดับ', 'ภารกิจที่ใช้บ่อย', '', 'ลำดับ', 'สนามบินเพิ่มเติม (ADMIN ยืนยันแล้ว)'], [7, 22, 11, 12, 9, 3, 7, 52, 3, 7, 34]);
  lists.getRange('F4').setBackground(null); lists.getRange('I4').setBackground(null); lists.getRange('D:D').setNumberFormat('@');
  readmeSheet_(ss);

  // ใส่ข้อมูลปัจจุบัน (เฉพาะชีทที่ยังว่าง)
  if (log.getLastRow() < FIRST) {
    const codes = SEED.lists.codes;
    const rows = SEED.entries.slice().sort((a, b) => (a.ym + String(a.day).padStart(2, '0')).localeCompare(b.ym + String(b.day).padStart(2, '0'))).map(e => entryToRow_(e, codes));
    log.getRange(FIRST, 1, rows.length, LOG_COLS.length).setValues(rows);
    for (let r = FIRST; r < FIRST + rows.length; r++) formatLogRow_(log, r);
  }
  if (alloc.getLastRow() < FIRST || !alloc.getRange(FIRST, 1).getValue()) writeAlloc_({ fy: CFG.FY, groups: SEED.alloc[String(CFG.FY)] || {}, byName: 'ค่าเริ่มต้นปีงบ 70' });
  if (lists.getLastRow() < FIRST || !lists.getRange(FIRST, 2).getValue()) writeLists_({ lists: SEED.lists, byName: 'ค่าเริ่มต้น' });
  const s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  [SH.README, SH.HIST, SH.LOG, SH.ALLOC, SH.LISTS].forEach((n, i) => { ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
  ss.setActiveSheet(ss.getSheetByName(SH.LOG));
  installBackupTrigger_();
  readAirports_(true);
  return 'ติดตั้งเสร็จ: ' + (log.getLastRow() - FIRST + 1) + ' รายการภารกิจ';
}
function readmeSheet_(ss) {
  let sh = ss.getSheetByName(SH.README); if (!sh) sh = ss.insertSheet(SH.README); else sh.clear();
  const rows = [
    ['ชีทที่ 6 · คำอธิบาย วิธีกู้ข้อมูล และคำเตือน', ''], ['', ''],
    ['⚠ คำเตือน', ''],
    ['ห้ามแก้ด้วยมือ', 'ชีท 2–5 เว็บเป็นผู้เขียน · ห้ามพิมพ์ ลบแถว แทรกแถว เรียงลำดับ เปลี่ยนชื่อชีท หรือย้ายคอลัมน์ · ต้องแก้ให้แก้ผ่านหน้าเว็บ (มีบันทึกในชีท 2)'],
    ['ดูข้อมูล', 'ใช้ไฟล์ “แสดงผล” (ดึงด้วย IMPORTRANGE) หรือ Filter view ในไฟล์นี้ ไม่กระทบข้อมูล'],
    ['สำรองข้อมูล', 'ทุกคืนประมาณ 02:00 สคริปต์คัดลอกไฟล์นี้ไปโฟลเดอร์ 602DB_สำรองรายวัน เก็บ ' + CFG.BACKUP_KEEP_DAYS + ' วันล่าสุด'],
    ['📄 แต่ละชีท', ''],
    ['ชีทที่ 1 รายชื่อสนามบิน', 'ไฟล์ Google Sheet สนามบินแยกต่างหาก · ใช้คอลัมน์ “ข้อความแสดงผล” · แก้แล้วเว็บเห็นภายใน 1 ชั่วโมง'],
    ['ชีทที่ 2 ประวัติแก้ไข-ลบ', '1 แถว = 1 ช่องที่เปลี่ยน · การลบเก็บข้อมูลเต็มรายการ (JSON) ในช่อง “ค่าก่อน”'],
    ['ชีทที่ 3 602YEAR_LOG BOOK', '1 แถว = 1 ภารกิจ · รหัสรายการไม่ซ้ำ · คอลัมน์สุดท้าย (ซ่อน) ใช้โดยระบบ'],
    ['ชีทที่ 4 ชั่วโมงจัดสรร', 'ยอดต้นปี 1 แถวต่อกลุ่มต่อชนิดชั่วโมง + Revise 1 แถวต่อครั้ง'],
    ['ชีทที่ 5 เครื่อง-รหัส-ภารกิจ', 'เครื่อง รหัส บ.ล. กลุ่มชั่วโมงจัดสรร ภารกิจที่ใช้บ่อย และสนามบินที่ ADMIN เพิ่ม'],
    ['🛟 วิธีกู้ข้อมูล', ''],
    ['รายการถูกลบผิด', 'ชีท 2 → กรองการกระทำ = ลบ → คัดลอก “ค่าก่อน” → แจ้ง ADMIN บันทึกกลับผ่านหน้าเว็บ'],
    ['ค่าถูกแก้ผิด', 'ชีท 2 → กรองรหัสรายการ → ดู “ค่าก่อน” → แก้กลับผ่านหน้าเว็บ'],
    ['ไฟล์เสียหาย', '① ไฟล์ → ประวัติเวอร์ชัน → คืนค่าเวอร์ชันก่อนเกิดปัญหา  ② หรือเปิดสำเนาในโฟลเดอร์ 602DB_สำรองรายวัน แล้วคัดลอกชีท 2–5 กลับมา'],
  ];
  sh.getRange(1, 1, rows.length, 2).setValues(rows).setFontFamily('TH SarabunPSK').setFontSize(16).setVerticalAlignment('middle').setWrap(true);
  sh.getRange(1, 1).setFontSize(20).setFontWeight('bold').setFontColor('#1F3864');
  rows.forEach((r, i) => { if (r[0] && !r[1] && i > 1) sh.getRange(i + 1, 1, 1, 2).merge().setBackground('#1F3864').setFontColor('#FFFFFF').setFontWeight('bold');
    else if (r[1]) sh.getRange(i + 1, 1).setFontWeight('bold').setBackground('#D9E1F2'); });
  sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 820);
}

// ======================= ตัวช่วย =======================
function book_() { try { return SpreadsheetApp.openById(CFG.SHEET_ID); } catch (e) { return SpreadsheetApp.getActive(); } }
function sheet_(name) { const sh = book_().getSheetByName(name); if (!sh) throw httpErr_('setup', 'ยังไม่ได้ติดตั้งชีท “' + name + '” — เรียก setup() ก่อน'); return sh; }
function findRow_(sh, id) {
  if (!id) return 0; const last = sh.getLastRow(); if (last < FIRST) return 0;
  const ids = sh.getRange(FIRST, 1, last - FIRST + 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return FIRST + i;
  return 0;
}
function formatLogRow_(sh, r) {
  const rg = sh.getRange(r, 1, 1, LOG_COLS.length);
  rg.setFontFamily('TH SarabunPSK').setFontSize(16).setVerticalAlignment('middle').setWrap(true);
  sh.getRange(r, LOGC.date + 1).setNumberFormat('d mmm yy');
  sh.getRange(r, LOGC.hours + 1).setNumberFormat('0.0');
  sh.getRange(r, LOGC.at + 1).setNumberFormat('d mmm yy hh:mm'); sh.getRange(r, LOGC.editedAt + 1).setNumberFormat('d mmm yy hh:mm');
}
function newId_() { return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function fyOf_(y, m) { return m >= 10 ? y + 544 : y + 543; }
function nz_(v) { return (v === null || v === undefined || v === '') ? '' : +v; }
function iso_(v) { return v instanceof Date ? v.toISOString() : (v ? String(v) : ''); }
function prop_(k, dflt) { return PropertiesService.getScriptProperties().getProperty(k) || dflt; }
function checkHash_(plain, hex) {
  if (!plain) return false;
  const d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(plain), Utilities.Charset.UTF_8);
  return d.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('') === hex;
}
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(20000); try { return fn(); } finally { l.releaseLock(); } }
function httpErr_(code, msg) { const e = new Error(msg); e.code = code; return e; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function putBig_(cache, key, obj, ttl) {   // CacheService เก็บได้ 100KB ต่อค่า → แบ่งเป็นชิ้น
  const s = JSON.stringify(obj), n = Math.ceil(s.length / 90000), parts = {};
  for (let i = 0; i < n; i++) parts[key + '_' + i] = s.slice(i * 90000, (i + 1) * 90000);
  parts[key + '_n'] = String(n); cache.putAll(parts, ttl);
}
function getBig_(cache, key) {
  const n = +(cache.get(key + '_n') || 0); if (!n) return null;
  const keys = Array.from({ length: n }, (_, i) => key + '_' + i), got = cache.getAll(keys);
  if (keys.some(k => got[k] == null)) return null;
  try { return JSON.parse(keys.map(k => got[k]).join('')); } catch (e) { return null; }
}
