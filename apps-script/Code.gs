/**
 * 602 LOG BOOK — ฐานข้อมูลหลังบ้าน (Google Apps Script)
 * ติดตั้งครั้งเดียวในไฟล์ "602DB_LOG BOOK ปีงบ70_ต้นทาง" (บัญชี ohomee.aviation@gmail.com)
 * ส่วนขยาย → Apps Script → วางไฟล์นี้ + Seed.gs → เรียก setup() 1 ครั้ง → ทำให้ใช้งานได้ (Deploy) เป็น Web app
 *
 * สคริปต์ตัวเดียวดูแลทุกปีงบ — ขึ้นปีงบใหม่ให้ ADMIN เพิ่มจากหน้าเว็บ (ภาพรวม → เพิ่มปีงบใหม่) ไม่ต้องแก้โค้ด
 * อย่าลบไฟล์ปีงบ 70 เพราะสคริปต์อยู่ในไฟล์นั้น
 *
 * ชีทในไฟล์ต้นทางแต่ละปี (ชีทที่ 1 รายชื่อสนามบิน อยู่ในไฟล์แยก):
 *   2 ประวัติแก้ไข-ลบ · 3 602YEAR_LOG BOOK · 4 ชั่วโมงจัดสรร · 5 เครื่อง-รหัส-ภารกิจ · 6 อ่านก่อน
 */

// ======================= ตั้งค่า =======================
const CFG = {
  FY: 2570,                                                      // ปีงบแรก (ไฟล์ที่ติดตั้งสคริปต์)
  SHEET_ID: '1KpUmauu8c9acPEmNMOGWyBTzg8B2uNVb0DYAjE2_6dM',      // 602DB_LOG BOOK ปีงบ70_ต้นทาง
  DISPLAY_ID: '15fWBt6mn1g-cGDnR-PYDB6_IR16a74yhVhh8MfoUZ9A',    // 602DB_LOG BOOK ปีงบ70_แสดงผล
  AIRPORT_SHEET_ID: '1desVWlj1x8E_05EP6rTa7Rj9CfjY6-t10SlB1DPUdrs', // ชีทที่ 1 รายชื่อสนามบิน
  BACKUP_FOLDER_ID: '1x6iMd_fcg5wcBnKlR-4k9zHF9PLoa1wv',         // โฟลเดอร์ 602DB_สำรองรายวัน
  BACKUP_KEEP_DAYS: 30,
  BACKUP_HOUR: 2,                                                // สำรองทุกคืนเวลาประมาณ 02:00
  // ระบบ Login กลาง ฝูง.602 (repo rtaf602/eadmin): ที่อยู่ระบบหลังบ้าน = backendUrl ในไฟล์ eadmin/docs/assets/config.js
  // เปลี่ยนที่อยู่ภายหลัง: ใส่ใน Script Properties LOGIN_URL แทนการแก้โค้ด
  LOGIN_URL: 'https://script.google.com/macros/s/AKfycbyLo0HinJWok4wSKL7WB_kj_UNZGNa4KQcog4beN3TMLZvQLZdBhe7qzGfiGB7icE9_yw/exec',
  WEB_CODE: 'WEB11',                 // รหัสเว็บนี้ในรายชื่อเว็บของหน้า Admin (ต้องตรงกับ WEB_CODE ใน config.js)
  CHECK_SEC: 60,                     // อ่านอย่างเดียว: ถามระบบ Login ซ้ำทุก 60 วินาที / การบันทึกทุกครั้งถามใหม่เสมอ
  // SHA-256 ของรหัส ADMIN (ไม่เก็บรหัสจริงในโค้ด) — เปลี่ยนรหัส: ใส่ค่าใหม่ใน Script Properties ADMIN_HASH
  ADMIN_HASH: '9f2b75a5b90c42ba4b8386b6555db2ebda000f035a03c6120f9e725c8bde4280',
  TZ: 'Asia/Bangkok',
};
const SH = { HIST: '2 ประวัติแก้ไข-ลบ', LOG: '3 602YEAR_LOG BOOK', ALLOC: '4 ชั่วโมงจัดสรร', LISTS: '5 เครื่อง-รหัส-ภารกิจ', README: '6 อ่านก่อน', USE: '7 ประวัติ Export-คัดลอก' };
const HEAD_ROW = 4, FIRST = 5;   // แถวหัวตาราง / แถวข้อมูลแรก (แถว 1–2 เป็นชื่อชีทและคำอธิบาย)

const TYPE_TH = { dechochai: 'เดโชชัย', vip: 'บุคคลสำคัญ', training: 'ฝึกบิน' };
const TYPE_ID = { 'เดโชชัย': 'dechochai', 'บุคคลสำคัญ': 'vip', 'ฝึกบิน': 'training' };
const GROUP_NAME = { '15': 'บ.ล.๑๕/ก (AIRBUS 319 CJ/ACJ320)', '18': 'บ.ล.๑๘ (SSJ100LR)', '19': 'บ.ล.๑๙ (AIRBUS 340-500)' };
const CODE_GROUP = { 'บ.ล.15': '15', 'บ.ล.15ก': '15', 'บ.ล.18': '18', 'บ.ล.19': '19' };

// คอลัมน์ชีท 3 (ลำดับห้ามเปลี่ยน — สคริปต์อ้างตำแหน่งนี้)
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
const USE_COLS = ['ลำดับ', 'เวลา\n(เวลาไทย)', 'Username', 'ยศ ชื่อ-สกุล', 'สิทธิ์ในเว็บ', 'การกระทำ', 'หน้า / ตาราง', 'ชื่อไฟล์', 'ช่วงข้อมูล'];
// การกระทำที่บันทึกได้ (ปุ่ม Export และปุ่มคัดลอกทุกปุ่มของหน้าเว็บ) — ข้อความอื่นไม่รับ
const USE_KINDS = ['Export Excel (ช่วงที่เลือก)', 'Export ทั้งปีงบ (แยกแท็บรายเดือน)', 'Export สรุปรายปีงบ (ตามแบบ บ.)', 'Export Excel ชั่วโมงบิน (ช่วงที่เลือก)', 'Export Excel ชั่วโมงบิน (ทั้งปีงบ)',
  'คัดลอกตารางไป Excel', 'คัดลอกตารางเป็นรูป', 'คัดลอกตาราง', 'คัดลอกกราฟ', 'บันทึกกราฟเป็นรูป'];
const ALLOC_COLS = ['ปีงบ', 'กลุ่ม', 'แบบ บ. (กลุ่ม)', 'รายการ', 'ชนิดชั่วโมง', 'ได้รับเดือนที่\n(1=ต.ค. … 11=ส.ค.)', 'ชั่วโมง\n(ต้นปี = ยอดทั้งปี\nRevise = เพิ่ม/ลด)', 'ผู้บันทึก', 'เวลาบันทึก', 'หมายเหตุ'];

// ======================= Web app =======================
function doGet() { return json_({ ok: true, service: '602 LOG BOOK', login: CFG.WEB_CODE, time: new Date().toISOString() }); }

// สิทธิ์ (ผู้ใช้กำหนด 16 พ.ย. 2026) — Role ของเว็บนี้ (WEB11) มาจากระบบ Login กลาง ตรวจทุกคำขอ
//   Viewer: ดูหน้าภาพรวมอย่างเดียว · Editor: + บันทึก / แก้ไขทุกรายการ · Admin: + ADMIN DATA USING
//   Admin + รหัส ADMIN: ลบภารกิจ, ชั่วโมงจัดสรร / Revise, ตั้งค่ารายการตัวเลือก, เพิ่มปีงบ (วางลิงก์ไฟล์)
// action ที่เปลี่ยนข้อมูลถามระบบ Login ใหม่ทุกครั้ง (ไม่ใช้คำตอบที่จำไว้)
const FRESH = { me: 1, save: 1, delete: 1, setAlloc: 1, setLists: 1, addYear: 1, logUse: 1 };

function doPost(e) {
  let req = {};
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'คำขอไม่ถูกต้อง' }); }
  try {
    const s = auth_(req.pass, !!FRESH[req.action]);
    req.byName = s.who;                                    // ชื่อผู้ทำรายการ = ยศ + ชื่อ-สกุล ของบัญชีที่ Login ไม่ใช่ที่หน้าเว็บส่งมา
    const edit = () => { if (!s.edit) throw httpErr_('forbidden', 'บัญชีนี้มีสิทธิ์ดูอย่างเดียว (Viewer) บันทึกหรือแก้ไขข้อมูลไม่ได้'); };
    const adminRole = () => { if (!s.admin) throw httpErr_('forbidden', 'เฉพาะ Admin ของเว็บนี้'); };
    const admin = () => { adminRole(); if (!checkHash_(req.admin, prop_('ADMIN_HASH', CFG.ADMIN_HASH))) throw httpErr_('admin_pass', 'รหัส ADMIN ไม่ถูกต้อง'); };
    const reg = registry_(), years = Object.keys(reg).map(Number).sort((a, b) => a - b), latest = years[years.length - 1];
    const fy = +req.fy || latest, has = !!reg[fy];
    switch (req.action) {
      case 'me': return json_({ ok: true, me: { name: s.name, rank: s.rank, role: s.role, super: s.super } });
      case 'years': return json_({ ok: true, years: years.map(y => s.admin ? { fy: y, src: url_(reg[y].src), disp: reg[y].disp ? url_(reg[y].disp) : '' } : { fy: y }) });
      case 'entries': return json_({ ok: true, fy, registered: has, entries: has ? readEntries_(fy) : [] });
      case 'save': edit(); need_(has, fy); return json_(withLock_(() => saveEntry_(fy, req, s)));
      case 'delete': admin(); need_(has, fy); return json_(withLock_(() => deleteEntry_(fy, req)));
      case 'alloc': adminRole(); return json_({ ok: true, alloc: has ? readAlloc_(fy) : null });
      case 'setAlloc': admin(); need_(has, fy); return json_(withLock_(() => writeAlloc_(fy, req)));
      case 'lists': return json_({ ok: true, lists: readLists_(has ? fy : latest) });
      case 'setLists': admin(); return json_(withLock_(() => writeLists_(has ? fy : latest, req)));
      case 'addYear': admin(); return json_(withLock_(() => addYear_(req)));
      // ทุกครั้งที่กด Export หรือคัดลอก (ผู้ใช้สั่ง 16 พ.ย. 2026): หน้าเว็บรอให้บันทึกสำเร็จก่อน จึงให้ไฟล์ / คัดลอก
      case 'logUse': edit(); return json_(withLock_(() => logUse_(has ? fy : latest, req, s)));
      case 'airports': return json_({ ok: true, airports: readAirports_(!!req.refresh) });
      default: return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง ' + req.action });
    }
  } catch (err) {
    return json_({ ok: false, code: err.code || 'error', error: String(err.message || err) });
  }
}

// ======================= ทะเบียนปีงบ (เก็บใน Script Properties) =======================
const BOOK_OVERRIDE = {}, BOOKS = {};
function registry_() {
  let reg = {}; try { reg = JSON.parse(PropertiesService.getScriptProperties().getProperty('FILES') || '{}'); } catch (e) { reg = {}; }
  if (!reg[CFG.FY]) reg[CFG.FY] = { src: CFG.SHEET_ID, disp: CFG.DISPLAY_ID };
  return reg;
}
function saveRegistry_(reg) { PropertiesService.getScriptProperties().setProperty('FILES', JSON.stringify(reg)); }
function book_(fy) {
  if (BOOK_OVERRIDE[fy]) return BOOK_OVERRIDE[fy];
  if (BOOKS[fy]) return BOOKS[fy];
  const r = registry_()[fy]; if (!r) throw httpErr_('nofy', 'ยังไม่ได้เพิ่มปีงบ ' + fy);
  return (BOOKS[fy] = SpreadsheetApp.openById(r.src));
}
function sheet_(fy, name) { const sh = book_(fy).getSheetByName(name); if (!sh) throw httpErr_('setup', 'ไฟล์ปีงบ ' + fy + ' ยังไม่มีชีท “' + name + '”'); return sh; }
function need_(has, fy) { if (!has) throw httpErr_('nofy', 'ยังไม่ได้เพิ่มปีงบ ' + fy + ' — ADMIN เพิ่มได้ที่ ADMIN DATA USING → เพิ่มปีงบใหม่'); }

// ======================= ชีท 3: ภารกิจ =======================
function readEntries_(fy) {
  const sh = sheet_(fy, SH.LOG), last = sh.getLastRow();
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
function saveEntry_(fy, req, s) {
  const e = Object.assign({}, req.data || {}); e.ym = req.ym || e.ym;
  // ผู้บันทึก = ยศ (พิมพ์เองได้ ตั้งต้นจากระบบ Login) + ชื่อ-สกุล ของบัญชีที่ Login (หน้าเว็บแก้ชื่อไม่ได้)
  const me = recorderOf_(e.rank, s); delete e.rank;
  e.recorder = me; e.editedByName = me;
  if (!/^\d{4}-\d{2}$/.test(e.ym || '')) throw httpErr_('bad', 'เดือนไม่ถูกต้อง');
  const [y, m] = e.ym.split('-').map(Number);
  if (fyOf_(y, m) !== fy) throw httpErr_('bad', 'เดือน ' + e.ym + ' ไม่อยู่ในปีงบ ' + fy);
  // ข้อ 23: ต้องกรอกครบ ยกเว้นหมายเหตุและข้อความถึง ADMIN
  const miss = [];
  if (!(+e.day >= 1 && +e.day <= 31)) miss.push('วันที่');
  if (!e.aircraft) miss.push('แบบ บ.'); if (!TYPE_TH[e.type]) miss.push('ประเภท');
  if (!String(e.mission || '').trim()) miss.push('ภารกิจ');
  if (!e.airports || e.airports.length < 2 || e.airports.some(a => !String(a).trim())) miss.push('เส้นทางบิน');
  if (!(+e.hours > 0)) miss.push('ชม.บิน'); if (e.pax == null || e.pax === '') miss.push('ผู้โดยสาร');
  if (e.cargo == null || e.cargo === '') miss.push('พัสดุ/กก.'); if (!(+e.flights > 0)) miss.push('เที่ยวบิน');
  if (!String(s.name || '').trim()) miss.push('ชื่อผู้บันทึกข้อมูล (บัญชีนี้ไม่มีชื่อ-สกุลในระบบ Login)');
  if (miss.length) throw httpErr_('bad', 'กรอกข้อมูลไม่ครบ: ' + miss.join(', '));
  const codes = readLists_(fy).codes, sh = sheet_(fy, SH.LOG);
  const id = String(req.id || '');
  const at = id ? findRow_(sh, id) : 0;
  if (id && at) {                                   // แก้ไข → บันทึกประวัติทีละช่อง
    const old = rowToEntry_(sh.getRange(at, 1, 1, LOG_COLS.length).getValues()[0]);
    e.id = id; e.recorder = old.recorder || e.recorder; e.at = old.at || e.at;
    e.editedByName = me; e.editedAt = new Date().toISOString();
    const newRow = entryToRow_(e, codes);
    sh.getRange(at, 1, 1, newRow.length).setValues([newRow]); formatLogRow_(sh, at);
    const changes = diff_(old, e);
    changes.forEach(c => history_(fy, 'แก้ไข', e, c.label, c.before, c.after, e.editedByName || '', ''));
    return { ok: true, id, changes: changes.length };
  }
  e.id = id || newId_(); e.at = e.at || new Date().toISOString(); e.editedByName = ''; e.editedAt = '';
  const row = entryToRow_(e, codes), r = Math.max(sh.getLastRow() + 1, FIRST);
  sh.getRange(r, 1, 1, row.length).setValues([row]); formatLogRow_(sh, r);
  return { ok: true, id: e.id };
}
function deleteEntry_(fy, req) {
  const sh = sheet_(fy, SH.LOG), at = findRow_(sh, String(req.id || ''));
  if (!at) throw httpErr_('notfound', 'ไม่พบรายการ (อาจถูกลบไปแล้ว)');
  const old = rowToEntry_(sh.getRange(at, 1, 1, LOG_COLS.length).getValues()[0]);
  history_(fy, 'ลบ', old, '(ทั้งรายการ)', JSON.stringify(old), '', req.byName || '', req.reason || '');
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
function history_(fy, action, e, field, before, after, who, why) {
  const sh = sheet_(fy, SH.HIST), r = Math.max(sh.getLastRow() + 1, FIRST);
  const [y, m] = String(e.ym || '').split('-').map(Number);
  sh.getRange(r, 1, 1, HIST_COLS.length).setValues([[r - FIRST + 1, new Date(), action, e.id || '', (y && e.day) ? new Date(y, m - 1, +e.day) : '',
    e.aircraft || '', TYPE_TH[e.type] || e.type || '', field, String(before), String(after), who, why]]);
  sh.getRange(r, 2).setNumberFormat('d mmm yy hh:mm'); sh.getRange(r, 5).setNumberFormat('d mmm yy');
  sh.getRange(r, 1, 1, HIST_COLS.length).setFontFamily('TH SarabunPSK').setFontSize(15).setVerticalAlignment('middle').setWrap(true);
}

// ======================= ชีท 4: ชั่วโมงจัดสรร =======================
function readAlloc_(fy) {
  const sh = sheet_(fy, SH.ALLOC), last = sh.getLastRow();
  const out = { fy, groups: {}, updatedByName: '', updatedAt: '' };
  if (last < FIRST) return out;
  sh.getRange(FIRST, 1, last - FIRST + 1, ALLOC_COLS.length).getValues().forEach(r => {
    if (+r[0] !== fy || !r[1]) return;
    const g = String(r[1]), kind = r[4] === 'ชม.ฝึกบิน' ? 'training' : 'total';
    const G = out.groups[g] = out.groups[g] || { total: null, training: null, revisions: [] };
    if (r[3] === 'ต้นปี') G[kind] = r[6] === '' ? null : +r[6];
    else if (r[3] === 'Revise' && r[5] !== '' && r[6] !== '') G.revisions.push({ kind, month: +r[5], add: +r[6] });
    if (r[8] instanceof Date && (!out.updatedAt || r[8] > new Date(out.updatedAt))) { out.updatedAt = r[8].toISOString(); out.updatedByName = r[7]; }
  });
  return out;
}
function writeAlloc_(fy, req) {
  const sh = sheet_(fy, SH.ALLOC), groups = req.groups || {}, who = req.byName || '', now = new Date(), rows = [];
  ['15', '18', '19'].concat(Object.keys(groups).filter(k => !['15', '18', '19'].includes(k))).forEach(g => {
    const G = groups[g]; if (!G) return;
    rows.push([fy, g, GROUP_NAME[g] || g, 'ต้นปี', 'ชม.บินรวม', '', G.total == null ? '' : +G.total, who, now, '']);
    rows.push([fy, g, GROUP_NAME[g] || g, 'ต้นปี', 'ชม.ฝึกบิน', '', G.training == null ? '' : +G.training, who, now, '']);
    (G.revisions || []).forEach(rv => rows.push([fy, g, GROUP_NAME[g] || g, 'Revise', rv.kind === 'training' ? 'ชม.ฝึกบิน' : 'ชม.บินรวม', +rv.month, +rv.add, who, now, '']));
  });
  const before = JSON.stringify(readAlloc_(fy).groups);
  const last = sh.getLastRow();
  if (last >= FIRST) sh.getRange(FIRST, 1, last - FIRST + 1, ALLOC_COLS.length).clearContent();
  if (rows.length) {
    sh.getRange(FIRST, 1, rows.length, ALLOC_COLS.length).setValues(rows);
    sh.getRange(FIRST, 7, rows.length, 1).setNumberFormat('#,##0.00'); sh.getRange(FIRST, 9, rows.length, 1).setNumberFormat('d mmm yy hh:mm');
    sh.getRange(FIRST, 1, rows.length, ALLOC_COLS.length).setFontFamily('TH SarabunPSK').setFontSize(16).setVerticalAlignment('middle');
  }
  history_(fy, 'แก้ชั่วโมงจัดสรร', { id: 'ปีงบ ' + fy }, 'ชั่วโมงจัดสรร', before, JSON.stringify(groups), who, '');
  return { ok: true, rows: rows.length };
}

// ======================= ชีท 5: เครื่อง / รหัส / ภารกิจ =======================
function readLists_(fy) {
  const sh = sheet_(fy, SH.LISTS), last = Math.max(sh.getLastRow(), FIRST);
  const v = sh.getRange(FIRST, 1, last - FIRST + 1, 11).getValues();
  const aircraft = [], codes = {}, mission = [], route = [];
  v.forEach(r => {
    if (r[1]) { codes[r[1]] = r[2]; if (r[4] !== 'ไม่') aircraft.push(String(r[1])); }
    if (r[7]) mission.push(String(r[7]));
    if (r[10]) route.push(String(r[10]));
  });
  return { aircraft, codes, mission, route };
}
function writeLists_(fy, req) {
  const L = req.lists || {}, sh = sheet_(fy, SH.LISTS), last = sh.getLastRow();
  const old = readLists_(fy);
  if (last >= FIRST) sh.getRange(FIRST, 1, last - FIRST + 1, 11).clearContent();
  const codes = L.codes || {}, active = (L.aircraft || []).slice();
  const retired = Object.keys(old.codes).filter(a => !active.includes(a));   // เครื่องที่เอาออก: เก็บไว้ “ไม่” ใช้งาน
  const acRows = active.map(a => [a, codes[a] || old.codes[a] || '', 'ใช่']).concat(retired.map(a => [a, old.codes[a] || '', 'ไม่']))
    .map((r, i) => [i + 1, r[0], r[1], CODE_GROUP[r[1]] || '', r[2]]);
  if (acRows.length) sh.getRange(FIRST, 1, acRows.length, 5).setValues(acRows);
  const ms = (L.mission || []).map((m, i) => [i + 1, m]); if (ms.length) sh.getRange(FIRST, 7, ms.length, 2).setValues(ms);
  const rt = (L.route || []).map((m, i) => [i + 1, m]); if (rt.length) sh.getRange(FIRST, 10, rt.length, 2).setValues(rt);
  sh.getRange(FIRST, 1, Math.max(acRows.length, ms.length, rt.length, 1), 11).setFontFamily('TH SarabunPSK').setFontSize(16);
  history_(fy, 'แก้รายการตัวเลือก', { id: 'ชีท 5' }, 'เครื่อง/รหัส/ภารกิจ', JSON.stringify(old), JSON.stringify(L), req.byName || '', '');
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

// ======================= สำรองรายวัน (ทุกปีงบ) =======================
function dailyBackup() {
  const folder = DriveApp.getFolderById(CFG.BACKUP_FOLDER_ID), reg = registry_();
  const stamp = Utilities.formatDate(new Date(), CFG.TZ, 'yyyy-MM-dd HHmm'), cutoff = Date.now() - CFG.BACKUP_KEEP_DAYS * 864e5;
  Object.keys(reg).forEach(fy => {
    try {
      const file = DriveApp.getFileById(reg[fy].src), prefix = file.getName() + '_สำรอง ';
      file.makeCopy(prefix + stamp, folder);
      const it = folder.getFiles();
      while (it.hasNext()) { const f = it.next(); if (f.getName().indexOf(prefix) === 0 && f.getDateCreated().getTime() < cutoff) f.setTrashed(true); }
    } catch (e) { console.error('สำรองปีงบ ' + fy + ' ไม่สำเร็จ: ' + e); }
  });
}
function installBackupTrigger_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'dailyBackup').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('dailyBackup').timeBased().everyDays(1).atHour(CFG.BACKUP_HOUR).inTimezone(CFG.TZ).create();
}

// ======================= ติดตั้งครั้งแรก / เพิ่มปีงบ =======================
/** เรียกครั้งเดียวจากหน้า Apps Script: ตั้งปีงบ 70, ใส่ข้อมูลปัจจุบัน, ตั้งไฟล์แสดงผล, ตั้งสำรองรายวัน */
function setup() {
  const reg = registry_(); saveRegistry_(reg);
  const r70 = reg[CFG.FY];
  const n = setupBook_(SpreadsheetApp.openById(r70.src), CFG.FY, SEED.entries, SEED.alloc[String(CFG.FY)] || {}, SEED.lists, 'ค่าเริ่มต้นปีงบ 70');
  let disp;
  try { setupDisplay_(r70.disp, r70.src, CFG.FY); disp = 'ตั้งไฟล์แสดงผลแล้ว'; }
  catch (e) { disp = 'ตั้งไฟล์แสดงผลไม่ได้ (' + e.message + ') — ไฟล์แสดงผลมีสูตรอยู่แล้ว ข้ามได้'; }
  installBackupTrigger_();
  readAirports_(true);
  const msg = 'ติดตั้งเสร็จ: ปีงบ ' + CFG.FY + ' มี ' + n + ' รายการภารกิจ · ' + disp;
  console.log(msg);
  return msg;
}

/** เพิ่มปีงบใหม่จากหน้าเว็บ: ลิงก์ไฟล์ต้นทาง + ลิงก์ไฟล์แสดงผล + รหัส ADMIN (ไม่ต้องแก้โค้ด) */
function addYear_(req) {
  const fy = +req.fy, reg = registry_();
  if (!(fy >= 2560 && fy <= 2700)) throw httpErr_('bad', 'ปีงบไม่ถูกต้อง (เช่น 2571)');
  const src = fileId_(req.srcUrl), disp = req.dispUrl ? fileId_(req.dispUrl) : '';
  if (!src) throw httpErr_('bad', 'ลิงก์ไฟล์ต้นทางไม่ถูกต้อง');
  if (req.dispUrl && !disp) throw httpErr_('bad', 'ลิงก์ไฟล์แสดงผลไม่ถูกต้อง');
  if (disp && disp === src) throw httpErr_('bad', 'ไฟล์ต้นทางกับไฟล์แสดงผลต้องเป็นคนละไฟล์');
  Object.keys(reg).forEach(y => {
    if (+y === fy) return;
    if ([reg[y].src, reg[y].disp].includes(src)) throw httpErr_('bad', 'ไฟล์ต้นทางนี้ใช้กับปีงบ ' + y + ' อยู่แล้ว');
    if (disp && [reg[y].src, reg[y].disp].includes(disp)) throw httpErr_('bad', 'ไฟล์แสดงผลนี้ใช้กับปีงบ ' + y + ' อยู่แล้ว');
  });
  if (reg[fy] && reg[fy].src !== src) throw httpErr_('bad', 'ปีงบ ' + fy + ' มีไฟล์ต้นทางอยู่แล้ว');
  let ss;
  try { ss = SpreadsheetApp.openById(src); ss.getName(); }
  catch (e) { throw httpErr_('access', 'เปิดไฟล์ต้นทางไม่ได้ — สร้างไฟล์ในบัญชี ohomee.aviation หรือแชร์สิทธิ์ผู้แก้ไข (Editor) ให้บัญชีนี้ก่อน'); }
  const log = ss.getSheetByName(SH.LOG);
  if (log && log.getLastRow() >= FIRST) {
    const fys = log.getRange(FIRST, LOGC.fy + 1, log.getLastRow() - FIRST + 1, 1).getValues().map(r => +r[0]).filter(Boolean);
    if (fys.some(y => y !== fy)) throw httpErr_('bad', 'ไฟล์นี้มีข้อมูลของปีงบอื่นอยู่ ใช้ไฟล์ใหม่ที่ว่าง');
  }
  const prevYears = Object.keys(reg).map(Number).filter(y => y !== fy).sort((a, b) => a - b), prev = prevYears[prevYears.length - 1];
  const lists = prev ? readLists_(prev) : SEED.lists;        // รายชื่อเครื่อง / รหัส / ภารกิจ ใช้ต่อจากปีก่อน
  setupBook_(ss, fy, [], null, lists, req.byName || 'ADMIN');
  reg[fy] = { src, disp }; saveRegistry_(reg);
  let display = 'ไม่ได้ใส่ลิงก์ไฟล์แสดงผล';
  if (disp) {
    try { setupDisplay_(disp, src, fy); display = 'ตั้งไฟล์แสดงผลแล้ว — เปิดไฟล์แสดงผลแล้วกด “อนุญาตการเข้าถึง” ที่ช่อง A1 ของแต่ละแท็บ (ครั้งเดียว)'; }
    catch (e) { display = 'เขียนไฟล์แสดงผลไม่ได้ — แชร์สิทธิ์ผู้แก้ไข (Editor) ให้ ohomee.aviation@gmail.com แล้วกดเพิ่มปีงบนี้ซ้ำ'; }
  }
  history_(fy, 'เพิ่มปีงบ', { id: 'ปีงบ ' + fy }, 'ไฟล์ต้นทาง / แสดงผล', '', url_(src) + (disp ? ' · ' + url_(disp) : ''), req.byName || '', '');
  return { ok: true, fy, name: ss.getName(), display };
}

/** สร้างชีท 2–6 ในไฟล์ต้นทางของปีงบ fy และใส่ข้อมูลตั้งต้น (เฉพาะชีทที่ยังว่าง) */
function setupBook_(ss, fy, entries, alloc0, lists0, byName) {
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
  mk(SH.HIST, 'ชีทที่ 2 · ประวัติการแก้ไขและการลบ', 'เว็บเขียนให้อัตโนมัติ · 1 แถว = 1 ช่องที่เปลี่ยน · การลบเก็บข้อมูลทั้งรายการไว้ในช่อง “ค่าก่อน” เพื่อกู้คืน · ห้ามแก้หรือลบแถวด้วยมือ',
    HIST_COLS, [7, 17, 14, 13, 12, 18, 12, 16, 40, 40, 24, 24]);
  const log = mk(SH.LOG, 'ชีทที่ 3 · 602YEAR_LOG BOOK ปีงบ ' + fy, '1 แถว = 1 ภารกิจ · เว็บเพิ่ม/แก้/ลบแถวให้ (จับคู่ด้วยรหัสรายการ) · ห้ามแก้ด้วยมือ · แบบฟอร์มรายเดือนและสรุปได้จากปุ่ม Export บนเว็บ',
    LOG_COLS.map(c => c[1]), LOG_COLS.map(c => c[2]));
  log.hideColumns(LOGC.airports + 1);
  log.getRange('C:C').setNumberFormat('@');
  const alloc = mk(SH.ALLOC, 'ชีทที่ 4 · ชั่วโมงจัดสรรต้นปีและ Revise ปีงบ ' + fy + ' (ADMIN DATA USING)', 'เว็บเขียนเมื่อกด “บันทึกชั่วโมงจัดสรร” · 1 แถว = ยอดต้นปี หรือ Revise 1 ครั้ง · Revise ลดชั่วโมงใส่ค่าลบ · ตารางสีเขียวขวามือเป็นสูตรตรวจดู เว็บไม่อ่าน',
    ALLOC_COLS, [8, 7, 30, 11, 13, 15, 18, 26, 17, 22]);
  alloc.getRange('L4:O4').setValues([['กลุ่ม', 'ชม.บินรวม\nทั้งปีหลัง Revise', 'ชม.ฝึกบิน\nทั้งปีหลัง Revise', 'ชม.ภารกิจ\n(รวม − ฝึก)']])
    .setFontFamily('TH SarabunPSK').setFontWeight('bold').setBackground('#E2EFDA').setWrap(true).setHorizontalAlignment('center');
  alloc.getRange('L5:L7').setNumberFormat('@'); alloc.getRange('B:B').setNumberFormat('@');
  ['15', '18', '19'].forEach((g, i) => { const r = 5 + i;
    alloc.getRange(r, 12, 1, 4).setValues([[g, `=SUMIFS($G$5:$G$2000,$B$5:$B$2000,L${r},$E$5:$E$2000,"ชม.บินรวม")`, `=SUMIFS($G$5:$G$2000,$B$5:$B$2000,L${r},$E$5:$E$2000,"ชม.ฝึกบิน")`, `=M${r}-N${r}`]])
      .setBackground('#E2EFDA').setFontFamily('TH SarabunPSK').setFontSize(16).setNumberFormat('#,##0.00'); });
  const lists = mk(SH.LISTS, 'ชีทที่ 5 · รายชื่อเครื่อง รหัส บ.ล. และรายชื่อภารกิจที่ใช้บ่อย', 'เว็บอ่านเมื่อเปิดหน้า และเขียนเมื่อ ADMIN บันทึกในหน้าตั้งค่า · เครื่องที่ปลดประจำการเปลี่ยน “ใช้งาน” เป็น ไม่ — อย่าลบแถว',
    ['ลำดับ', 'แบบ บ.\n(ชื่อที่แสดงในเว็บ)', 'รหัส บ.ล.', 'กลุ่มชั่วโมง\nจัดสรร', 'ใช้งาน', '', 'ลำดับ', 'ภารกิจที่ใช้บ่อย', '', 'ลำดับ', 'สนามบินเพิ่มเติม (ADMIN ยืนยันแล้ว)'], [7, 22, 11, 12, 9, 3, 7, 52, 3, 7, 34]);
  lists.getRange('F4').setBackground(null); lists.getRange('I4').setBackground(null); lists.getRange('D:D').setNumberFormat('@');
  useSheet_(ss);
  readmeSheet_(ss, fy);

  if (log.getLastRow() < FIRST && entries && entries.length) {
    const codes = (lists0 || {}).codes || {};
    const rows = entries.slice().sort((a, b) => (a.ym + String(a.day).padStart(2, '0')).localeCompare(b.ym + String(b.day).padStart(2, '0'))).map(e => entryToRow_(e, codes));
    log.getRange(FIRST, 1, rows.length, LOG_COLS.length).setValues(rows);
    for (let r = FIRST; r < FIRST + rows.length; r++) formatLogRow_(log, r);
  }
  BOOK_OVERRIDE[fy] = ss;            // ใช้ไฟล์นี้ตรง ๆ ระหว่างตั้งค่า (ก่อนลงทะเบียนปีงบ)
  try {
    if (alloc0 && (alloc.getLastRow() < FIRST || !alloc.getRange(FIRST, 1).getValue())) writeAlloc_(fy, { groups: alloc0, byName });
    if (lists.getLastRow() < FIRST || !lists.getRange(FIRST, 2).getValue()) writeLists_(fy, { lists: lists0 || {}, byName });
  } finally { delete BOOK_OVERRIDE[fy]; }
  const s1 = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1') || ss.getSheetByName('แผ่นงาน1');
  if (s1 && s1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s1);
  [SH.README, SH.HIST, SH.LOG, SH.ALLOC, SH.LISTS].forEach((n, i) => { ss.setActiveSheet(ss.getSheetByName(n)); ss.moveActiveSheet(i + 1); });
  ss.setActiveSheet(ss.getSheetByName(SH.LOG));
  return Math.max(0, log.getLastRow() - FIRST + 1);
}

/** ไฟล์แสดงผล: แท็บ 2–5 ดึงจากไฟล์ต้นทางด้วย IMPORTRANGE (ไฟล์ต้องแชร์สิทธิ์ผู้แก้ไขให้บัญชีสคริปต์) */
function setupDisplay_(dispId, srcId, fy) {
  if (!dispId) throw new Error('ไม่มีไฟล์แสดงผล');
  const ds = SpreadsheetApp.openById(dispId);
  const tabs = [[SH.LOG, 'A1:V'], [SH.HIST, 'A1:L'], [SH.ALLOC, 'A1:O'], [SH.LISTS, 'A1:K'], [SH.USE, 'A1:I']];
  let note = ds.getSheetByName('อ่านก่อน');
  if (!note) {
    const first = ds.getSheets()[0];
    if (first && first.getLastRow() === 0 && !tabs.some(t => t[0] === first.getName())) { note = first; note.setName('อ่านก่อน'); }
    else note = ds.insertSheet('อ่านก่อน', 0);
  }
  note.getRange(1, 1, 5, 2).setValues([
    ['602DB_LOG BOOK ปีงบ' + String(fy).slice(-2) + '_แสดงผล', ''],
    ['ไฟล์นี้ใช้ดูอย่างเดียว', 'ทุกแท็บดึงข้อมูลจากไฟล์ต้นทางด้วย IMPORTRANGE · แก้ที่นี่ไม่มีผลกับข้อมูลจริง · ต้องการแก้ให้แก้ผ่านหน้าเว็บ'],
    ['ครั้งแรกที่เปิด', 'แต่ละแท็บจะขึ้น #REF! ให้คลิกที่ช่อง A1 แล้วกด “อนุญาตการเข้าถึง” (Allow access) ทำครั้งเดียวต่อแท็บ'],
    ['ไฟล์ต้นทาง', url_(srcId)],
    ['ข้อมูลอัปเดต', 'IMPORTRANGE อัปเดตเองภายในไม่กี่นาทีหลังมีการบันทึก'],
  ]).setFontFamily('TH SarabunPSK').setFontSize(16).setWrap(true);
  note.getRange(1, 1).setFontSize(20).setFontWeight('bold'); note.setColumnWidth(1, 200); note.setColumnWidth(2, 760);
  tabs.forEach(([name, rng], i) => {
    const sh = ds.getSheetByName(name) || ds.insertSheet(name, i + 1);
    sh.getRange(1, 1).setFormula('=IMPORTRANGE("' + srcId + '","\'' + name + '\'!' + rng + '")');
  });
  ds.setSpreadsheetTimeZone(CFG.TZ);
}

function readmeSheet_(ss, fy) {
  let sh = ss.getSheetByName(SH.README); if (!sh) sh = ss.insertSheet(SH.README); else sh.clear();
  const rows = [
    ['ชีทที่ 6 · คำอธิบาย วิธีกู้ข้อมูล และคำเตือน · ปีงบ ' + fy, ''], ['', ''],
    ['⚠ คำเตือน', ''],
    ['ห้ามแก้ด้วยมือ', 'ชีท 2–5 และ 7 เว็บเป็นผู้เขียน · ห้ามพิมพ์ ลบแถว แทรกแถว เรียงลำดับ เปลี่ยนชื่อชีท หรือย้ายคอลัมน์ · ต้องแก้ให้แก้ผ่านหน้าเว็บ (มีบันทึกในชีท 2)'],
    ['ดูข้อมูล', 'ใช้ไฟล์ “แสดงผล” (ดึงด้วย IMPORTRANGE) หรือ Filter view ในไฟล์นี้ ไม่กระทบข้อมูล'],
    ['สำรองข้อมูล', 'ทุกคืนประมาณ 02:00 สคริปต์คัดลอกไฟล์นี้ไปโฟลเดอร์ 602DB_สำรองรายวัน เก็บ ' + CFG.BACKUP_KEEP_DAYS + ' วันล่าสุด'],
    ['📄 แต่ละชีท', ''],
    ['ชีทที่ 1 รายชื่อสนามบิน', 'ไฟล์ Google Sheet สนามบินแยกต่างหาก · ใช้คอลัมน์ “ข้อความแสดงผล” · แก้แล้วเว็บเห็นภายใน 1 ชั่วโมง'],
    ['ชีทที่ 2 ประวัติแก้ไข-ลบ', '1 แถว = 1 ช่องที่เปลี่ยน · การลบเก็บข้อมูลเต็มรายการ (JSON) ในช่อง “ค่าก่อน”'],
    ['ชีทที่ 3 602YEAR_LOG BOOK', '1 แถว = 1 ภารกิจ · รหัสรายการไม่ซ้ำ · คอลัมน์สุดท้าย (ซ่อน) ใช้โดยระบบ'],
    ['ชีทที่ 4 ชั่วโมงจัดสรร', 'ยอดต้นปี 1 แถวต่อกลุ่มต่อชนิดชั่วโมง + Revise 1 แถวต่อครั้ง'],
    ['ชีทที่ 5 เครื่อง-รหัส-ภารกิจ', 'เครื่อง รหัส บ.ล. กลุ่มชั่วโมงจัดสรร ภารกิจที่ใช้บ่อย และสนามบินที่ ADMIN เพิ่ม'],
    ['ชีทที่ 7 ประวัติ Export-คัดลอก', '1 แถว = กด Export Excel หรือคัดลอกตาราง / กราฟ 1 ครั้ง · Username และ ยศ ชื่อ-สกุล มาจากระบบ Login กลาง · เว็บให้ไฟล์ / คัดลอกได้หลังบันทึกแถวนี้สำเร็จเท่านั้น'],
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
function findRow_(sh, id) {
  if (!id) return 0; const last = sh.getLastRow(); if (last < FIRST) return 0;
  const ids = sh.getRange(FIRST, 1, last - FIRST + 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === id) return FIRST + i;
  return 0;
}
function formatLogRow_(sh, r) {
  sh.getRange(r, 1, 1, LOG_COLS.length).setFontFamily('TH SarabunPSK').setFontSize(16).setVerticalAlignment('middle').setWrap(true);
  sh.getRange(r, LOGC.date + 1).setNumberFormat('d mmm yy');
  sh.getRange(r, LOGC.hours + 1).setNumberFormat('0.0');
  sh.getRange(r, LOGC.at + 1).setNumberFormat('d mmm yy hh:mm'); sh.getRange(r, LOGC.editedAt + 1).setNumberFormat('d mmm yy hh:mm');
}
function fileId_(u) { const s = String(u || '').trim(); const m = /\/d\/([a-zA-Z0-9_-]{20,})/.exec(s) || /^([a-zA-Z0-9_-]{25,})$/.exec(s); return m ? m[1] : ''; }
function url_(id) { return 'https://docs.google.com/spreadsheets/d/' + id; }
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

// ======================= ระบบ Login กลาง (repo rtaf602/eadmin) =======================
/* หน้าเว็บขอ "บัตรผ่าน" (pass) ของเว็บนี้จากระบบ Login (App.enterWeb('WEB11')) แล้วส่งมากับทุกคำขอ
   สคริปต์นี้ส่ง pass ไปถามระบบ Login (op web.check) ได้ ยศ ชื่อ-สกุล และ Role ของเว็บนี้
   คำตอบเก็บใน cache ตาม CFG.CHECK_SEC เฉพาะคำขอที่อ่านอย่างเดียว ที่ cache เก็บแค่เครื่องหมายของ pass ไม่เก็บ pass */
function loginUrl_() { return String(prop_('LOGIN_URL', CFG.LOGIN_URL) || '').trim(); }
function loginUrlOk_(url) { return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url); }
function auth_(pass, fresh) {
  pass = String(pass || '');
  if (!pass || pass.length > 800) throw httpErr_('auth', 'ให้เข้าสู่ระบบ');
  let w = '';
  try { w = String(JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(pass.split('.')[0])).getDataAsString()).w || ''); } catch (x) { w = ''; }
  if (w && w !== CFG.WEB_CODE) throw httpErr_('wrong_web', 'รหัสเว็บในไฟล์ config.js (' + w + ') ไม่ตรงกับ CFG.WEB_CODE ใน Apps Script (' + CFG.WEB_CODE + ') ให้แก้ให้ตรงกัน');
  const key = sha256_('logbook|' + pass).slice(0, 32), cache = CacheService.getScriptCache();
  if (!fresh) { const hit = cache.get('who:' + key); if (hit) return JSON.parse(hit); }
  const url = loginUrl_();
  if (!loginUrlOk_(url)) throw httpErr_('config', 'ยังไม่ได้ตั้งที่อยู่ระบบ Login (CFG.LOGIN_URL)');
  let j = null;
  try {
    const res = UrlFetchApp.fetch(url, { method: 'post', contentType: 'text/plain;charset=utf-8', payload: JSON.stringify({ v: 1, op: 'web.check', pass: pass, web: CFG.WEB_CODE }), muteHttpExceptions: true, followRedirects: true });
    j = JSON.parse(res.getContentText());
  } catch (x) { j = null; }
  if (!j || (!j.ok && !j.error)) throw httpErr_('busy', 'ตรวจสิทธิ์กับระบบ Login ไม่ได้ ลองอีกครั้ง');
  if (!j.ok) {
    cache.remove('who:' + key);
    const c = String(j.error.code || '');
    if (c === 'auth' || c === 'expired' || c === 'taken') throw httpErr_('auth', String(j.error.message || 'ให้เข้าสู่ระบบใหม่'));
    if (c === 'no_web' || c === 'web_closed') throw httpErr_(c, String(j.error.message || 'บัญชีนี้ไม่มีสิทธิ์ใช้งานเว็บนี้ ให้ติดต่อ Admin'));
    throw httpErr_('busy', String(j.error.message || 'ระบบ Login ขัดข้อง ลองอีกครั้ง'));
  }
  const u = j.user || {}, role = String(j.role || '');
  const name = String(u.name || u.username || '').trim().slice(0, 80), rank = cleanRank_(u.rank);
  const who = { name: name, rank: rank, who: (rank + name).trim(), username: String(u.username || '').slice(0, 40), role: role, edit: role === 'Admin' || role === 'Editor', admin: role === 'Admin', super: j.super === true };
  const left = Math.floor((Number(j.expiresAt) - Date.now()) / 1000);
  if (left > 1) cache.put('who:' + key, JSON.stringify(who), Math.min(CFG.CHECK_SEC, left));
  return who;
}
// ยศที่ผู้ใช้พิมพ์ (ยศเปลี่ยนได้ตามเวลา ผู้ใช้สั่ง 16 พ.ย. 2026): ตัดช่องว่างหัวท้าย ไม่เกิน 30 ตัว ห้ามขึ้นต้นแบบสูตร
function cleanRank_(v) { return String(v == null ? '' : v).replace(/[\r\n\t]/g, ' ').trim().replace(/^[=+\-@]+/, '').trim().slice(0, 30); }
function recorderOf_(rank, s) { const r = rank == null || rank === '' ? s.rank : cleanRank_(rank); return (r + s.name).trim(); }
function sha256_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, t, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
/** เรียกครั้งเดียวจากหน้า Apps Script หลังวางโค้ดรุ่นนี้: ขอสิทธิ์เรียกเว็บภายนอก และตรวจว่าระบบ Login ตอบ */
function setupLogin() {
  const url = loginUrl_();
  if (!loginUrlOk_(url)) throw new Error('CFG.LOGIN_URL ต้องเป็นที่อยู่ Web app ของระบบ Login (ขึ้นต้น https://script.google.com/macros/s/ ลงท้าย /exec)');
  let ok = false;
  try { ok = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true }).getContentText()).service === 'eadmin602'; } catch (x) { ok = false; }
  if (!ok) throw new Error('ติดต่อระบบ Login ที่ ' + url + ' ไม่ได้ ตรวจ CFG.LOGIN_URL แล้วเรียก setupLogin อีกครั้ง');
  PropertiesService.getScriptProperties().deleteProperty('ENTRY_HASH');   // รหัสเข้าเว็บเดิมไม่ใช้แล้ว
  // ชีท 7 ประวัติ Export-คัดลอก ในไฟล์ต้นทางทุกปีงบ + แท็บเดียวกันในไฟล์แสดงผล (ไม่แตะข้อมูลในชีท 2–5)
  const reg = registry_(), notes = [];
  Object.keys(reg).forEach(y => {
    try {
      const ss = SpreadsheetApp.openById(reg[y].src); useSheet_(ss); readmeSheet_(ss, +y);
      if (reg[y].disp) {
        const ds = SpreadsheetApp.openById(reg[y].disp);
        if (!ds.getSheetByName(SH.USE)) ds.insertSheet(SH.USE).getRange(1, 1).setFormula('=IMPORTRANGE("' + reg[y].src + '","\'' + SH.USE + '\'!A1:I")');
      }
      notes.push('ปีงบ ' + y + ': ชีท 7 พร้อม');
    } catch (e) { notes.push('ปีงบ ' + y + ': ตั้งชีท 7 ไม่ได้ (' + e.message + ')'); }
  });
  const msg = 'ระบบ Login ตอบแล้ว · รหัสเว็บนี้ ' + CFG.WEB_CODE + ' (ต้องตรงกับรายชื่อเว็บในหน้า Admin ของ E ADMIN) · ' + notes.join(' · ');
  console.log(msg); return msg;
}

// ======================= ชีท 7: ประวัติ Export / คัดลอก =======================
/** สร้างชีท 7 ถ้ายังไม่มี (ไฟล์ปีงบเดิมได้ชีทนี้ตอนบันทึกครั้งแรก หรือตอนเรียก setupLogin) ไม่แตะชีทอื่น */
function useSheet_(ss) {
  let sh = ss.getSheetByName(SH.USE);
  if (sh && sh.getRange(HEAD_ROW, 1).getValue()) return sh;
  if (!sh) sh = ss.insertSheet(SH.USE);
  sh.getRange(1, 1).setValue('ชีทที่ 7 · ประวัติการ Export Excel และการคัดลอกตาราง / กราฟ').setFontFamily('TH SarabunPSK').setFontSize(20).setFontWeight('bold').setFontColor('#1F3864');
  sh.getRange(2, 1).setValue('เว็บเขียนให้อัตโนมัติทุกครั้งที่กดปุ่ม Export หรือปุ่มคัดลอก · ชื่อและ Username มาจากระบบ Login กลาง · ห้ามแก้หรือลบแถวด้วยมือ')
    .setFontFamily('TH SarabunPSK').setFontSize(14).setFontColor('#595959').setBackground('#FFF2CC').setWrap(false);
  sh.getRange(HEAD_ROW, 1, 1, USE_COLS.length).setValues([USE_COLS]).setFontFamily('TH SarabunPSK').setFontSize(15).setFontWeight('bold')
    .setFontColor('#FFFFFF').setBackground('#1F3864').setHorizontalAlignment('center').setVerticalAlignment('middle').setWrap(true);
  sh.setRowHeight(HEAD_ROW, 48); sh.setRowHeight(1, 34);
  [7, 17, 14, 26, 11, 30, 40, 44, 26].forEach((w, i) => sh.setColumnWidth(i + 1, Math.round(w * 7.5)));
  sh.setFrozenRows(HEAD_ROW);
  return sh;
}
const clip_ = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').trim().replace(/^[=+\-@]+/, '').slice(0, n);
function logUse_(fy, req, s) {
  const kind = String(req.kind || '');
  if (USE_KINDS.indexOf(kind) < 0) throw httpErr_('bad', 'ไม่รู้จักการกระทำ ' + kind);
  const sh = useSheet_(book_(fy)), r = Math.max(sh.getLastRow() + 1, FIRST);
  sh.getRange(r, 1, 1, USE_COLS.length).setValues([[r - FIRST + 1, new Date(), s.username || '', s.who, s.role, kind, clip_(req.where, 200), clip_(req.file, 200), clip_(req.range, 120)]]);
  sh.getRange(r, 2).setNumberFormat('d mmm yy hh:mm:ss');
  sh.getRange(r, 1, 1, USE_COLS.length).setFontFamily('TH SarabunPSK').setFontSize(15).setVerticalAlignment('middle');
  SpreadsheetApp.flush();
  return { ok: true, row: r };
}
