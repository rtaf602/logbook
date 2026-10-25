/**
 * 602 LOG BOOK — แจ้งเตือนเข้า LINE (CHAT BOT ขสอ.) ผ่าน LINE Messaging API
 * วางเป็นไฟล์สคริปต์ใหม่ชื่อ "Line" ในโปรเจกต์ Apps Script เดียวกับ Code.gs
 *
 * ตั้งค่าใน Apps Script → ⚙ การตั้งค่าโปรเจกต์ → Script Properties
 *   LINE_TOKEN       = Channel access token (long-lived) ของบอท           (ต้องมี)
 *   LINE_TO          = Group ID (ขึ้นต้น C…) หรือ User ID (ขึ้นต้น U…)     (บอทตั้งให้เองเมื่อพิมพ์ "ลงทะเบียน" ในกลุ่ม)
 *                      ส่งหลายปลายทางคั่นด้วยจุลภาค เช่น Cxxxx,Uyyyy
 *   LINE_DIGEST_MIN  = (ไม่บังคับ) 5 / 10 / 15 / 30 → รวมข้อความแล้วส่งเป็นรอบ ประหยัดโควตาข้อความ
 *                      เว้นว่าง = ส่งทันทีทุกครั้ง (หลังตั้งค่านี้ให้เรียก lineSetup() อีกครั้ง)
 *   LINE_OFF         = (ไม่บังคับ) ใส่ 1 เพื่อปิดการแจ้งเตือนชั่วคราว
 */

const TH_MON = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const FY_MON = m => TH_MON[(+m + 8) % 12];          // เดือนในปีงบ 1=ต.ค. … 12=ก.ย.
const LINE_API = 'https://api.line.me/v2/bot/message/';

// ======================= ข้อความแต่ละแบบ =======================
/** หัวข้อความ: 31 ต.ค.69 (23.00TH-LT) */
function thStamp_(d) {
  d = d || new Date();
  const f = p => Utilities.formatDate(d, CFG.TZ, p);
  return f('d') + ' ' + TH_MON[+f('M') - 1] + String((+f('yyyy') + 543) % 100).padStart(2, '0') + ' (' + f('HH.mm') + 'TH-LT)';
}
const dash_ = v => (v === null || v === undefined || String(v).trim() === '') ? '-' : String(v);
const hrs_ = v => (v === null || v === undefined || v === '') ? '-' : (+v).toFixed(1);
const num_ = v => (v === null || v === undefined || v === '') ? 'ไม่ได้กำหนด' : String(Math.round(+v * 100) / 100);
const typeScope_ = e => (TYPE_TH[e.type] || e.type || '-') + '(' + (e.scope === 'international' ? 'ต่างประเทศ' : 'ในประเทศ') + ')';

/** 2.1 บันทึกข้อมูลภารกิจ */
function msgNewEntry_(e) {
  return [
    thStamp_(),
    'ชื่อผู้บันทึก:' + dash_(e.recorder),
    'ประเภทภารกิจ :' + typeScope_(e),
    'ชื่อภารกิจ:' + dash_(e.mission),
    'เส้นทางบิน:' + dash_(e.route || (e.airports || []).join('-')),
    'ชม.บิน:' + hrs_(e.hours),
    'ผู้โดยสาร:' + dash_(e.pax),
    'พัสดุ/กก.:' + dash_(e.cargo),
    'เที่ยวบิน:' + dash_(e.flights),
    'หมายเหตุ:' + dash_(e.note),
    'ข้อความถึง ADMIN:' + dash_(e.adminMsg),
  ].join('\n');
}

/** 2.2 แก้ไขข้อมูลภารกิจ (เฉพาะช่องที่เปลี่ยน) — changes มาจาก diff_() ใน Code.gs */
function msgEditEntry_(e, who, changes) {
  const RENAME = { 'ภารกิจ': 'ชื่อภารกิจ', 'เส้นทาง': 'เส้นทางบิน', 'ประเภท': 'ประเภทภารกิจ' };
  const lines = changes.filter(c => c.label !== FIELD_TH.flightsManual).map(c => {
    const isH = c.label === FIELD_TH.hours;
    const b = isH ? hrs_(c.before) : dash_(c.before), a = isH ? hrs_(c.after) : dash_(c.after);
    return (RENAME[c.label] || c.label) + ': ' + b + '(เดิม) เป็น ' + a + '(ใหม่)';
  });
  if (!lines.length) return '';
  return [thStamp_(), 'ชื่อผู้บันทึก:' + dash_(who), 'ชื่อภารกิจ:' + dash_(e.mission), 'แก้ไขข้อมูล'].concat(lines).join('\n');
}

/** 2.3 ลบข้อมูลภารกิจ */
function msgDeleteEntry_(old, who) {
  return [
    thStamp_(),
    'ชื่อผู้บันทึก:' + dash_(who || old.recorder),
    'ประเภทภารกิจ :' + typeScope_(old),
    'ชื่อภารกิจ:' + dash_(old.mission),
    'ได้ลบภารกิจดังกล่าว',
  ].join('\n');
}

/** 2.4 บันทึกตั้งค่ารายการตัวเลือก (แบบ บ., ภารกิจ, เส้นทางบิน, รหัส บ.แบบ) */
function msgLists_(before, after, who) {
  const lines = [], TAIL = 'บันทึกตั้งค่ารายการตัวเลือก';
  const cmp = (a, b, label) => {
    a = a || []; b = b || [];
    b.filter(x => !a.includes(x)).forEach(x => lines.push(x + ' ถูกเพิ่มใน' + TAIL + ' (' + label + ')'));
    a.filter(x => !b.includes(x)).forEach(x => lines.push(x + ' ถูกลบออกจาก' + TAIL + ' (' + label + ')'));
  };
  cmp(before.aircraft, after.aircraft, 'แบบ บ.');
  cmp(before.mission, after.mission, 'ภารกิจ');
  cmp(before.route, after.route, 'เส้นทางบิน');
  (after.aircraft || []).forEach(a => {
    const o = (before.codes || {})[a], n = (after.codes || {})[a];
    if ((before.aircraft || []).includes(a) && String(o || '') !== String(n || ''))
      lines.push('รหัส บ.แบบ ของ ' + a + ': ' + dash_(o) + '(เดิม) เป็น ' + dash_(n) + '(ใหม่)');
  });
  if (!lines.length) return '';
  return [thStamp_(), 'ชื่อผู้บันทึก:' + dash_(who), 'แก้ไขข้อมูล'].concat(lines).join('\n');
}

/** 2.5 เพิ่มปีงบใหม่ (ADMIN) */
function msgAddYear_(fy, who) {
  return [thStamp_(), 'ชื่อผู้บันทึก:' + dash_(who), 'ลิงก์เก็บข้อมูลปีงบ ' + fy + ' ถูกบันทึกแล้ว'].join('\n');
}

/** 2.6 ชั่วโมงบินรวมจัดสรร / ชั่วโมงฝึกบินจัดสรร / Revise ของ บ.แต่ละแบบ */
function msgAlloc_(before, after, who) {
  const B = (before && before.groups) || {}, A = (after && after.groups) || {}, blocks = [];
  const KIND = { total: 'ชม.บินรวม', training: 'ชม.ฝึกบิน' };
  const keys = ['15', '18', '19'].concat(Object.keys(Object.assign({}, B, A)).filter(k => !['15', '18', '19'].includes(k)));
  keys.forEach(g => {
    const o = B[g] || { revisions: [] }, n = A[g] || { revisions: [] }, lines = [];
    if (!B[g] && !A[g]) return;
    ['total', 'training'].forEach(k => {
      if (String(o[k] == null ? '' : +o[k]) !== String(n[k] == null ? '' : +n[k]))
        lines.push(KIND[k] + 'จัดสรร(ทั้งปี) ถูกแก้ไข จากเดิม ' + num_(o[k]) + ' ชม. เป็น ' + num_(n[k]) + ' ชม.');
    });
    const sig = r => r.kind + '|' + r.month + '|' + (+r.add);
    const left = (o.revisions || []).map(sig);
    (n.revisions || []).forEach(r => {                       // Revise ที่เพิ่มเข้ามา
      const i = left.indexOf(sig(r)); if (i >= 0) { left.splice(i, 1); return; }
      lines.push(['ได้รับ Revise เดือน ' + FY_MON(r.month), 'ประเภท ' + KIND[r.kind] ,
        (+r.add >= 0 ? 'ชั่วโมงที่ได้เพิ่ม ' : 'ชั่วโมงที่ลดลง ') + num_(Math.abs(+r.add)) + ' ชม.'].join('\n'));
    });
    left.forEach(s => {                                      // Revise ที่ถูกลบ
      const [kind, month, add] = s.split('|');
      lines.push('Revise เดือน ' + FY_MON(month) + ' ประเภท ' + KIND[kind] + ' (' + (+add >= 0 ? '+' : '') + num_(add) + ' ชม.) ถูกลบออก');
    });
    if (lines.length) blocks.push(String(GROUP_NAME[g] || g).split(' (')[0] + '\n' + lines.join('\n'));
  });
  if (!blocks.length) return '';
  return thStamp_() + '\nชื่อผู้บันทึก:' + dash_(who) + '\n' + blocks.join('\n\n');
}

// ======================= ส่งข้อความ =======================
/** เรียกจาก doPost หลังบันทึกสำเร็จ — ส่งไม่สำเร็จจะไม่ทำให้การบันทึกล้ม */
function lineNotify_(text) {
  if (!text) return;
  try {
    if (prop_('LINE_OFF', '') === '1') return;
    const digest = +prop_('LINE_DIGEST_MIN', 0);
    if (digest > 0) return lineQueue_(text);
    linePush_(text);
  } catch (err) { console.error('ส่ง LINE ไม่สำเร็จ: ' + err); }
}

function linePush_(text) {
  const token = prop_('LINE_TOKEN', ''), to = prop_('LINE_TO', '');
  if (!token || !to) { console.warn('ยังไม่ได้ตั้ง LINE_TOKEN / LINE_TO'); return; }
  const chunks = [];                                         // LINE รับข้อความละไม่เกิน 5,000 ตัวอักษร, 5 ข้อความต่อครั้ง
  for (let s = String(text); s.length; s = s.slice(4900)) chunks.push(s.slice(0, 4900));
  to.split(',').map(s => s.trim()).filter(Boolean).forEach(id => {
    for (let i = 0; i < chunks.length; i += 5) {
      const res = UrlFetchApp.fetch(LINE_API + 'push', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({ to: id, messages: chunks.slice(i, i + 5).map(t => ({ type: 'text', text: t })) }),
      });
      if (res.getResponseCode() !== 200) console.error('LINE push ' + res.getResponseCode() + ': ' + res.getContentText());
    }
  });
}

// ----- โหมดรวมข้อความ (LINE_DIGEST_MIN) -----
function lineQueue_(text) {
  const p = PropertiesService.getScriptProperties();
  let q; try { q = JSON.parse(p.getProperty('LINE_QUEUE') || '[]'); } catch (e) { q = []; }
  q.push(text);
  const s = JSON.stringify(q);
  if (s.length > 8000) { p.deleteProperty('LINE_QUEUE'); linePush_(q.join('\n\n━━━━━━━━━━\n\n')); }  // Script Property เก็บได้ ~9KB → เต็มแล้วส่งเลย
  else p.setProperty('LINE_QUEUE', s);
}
/** ตัวตั้งเวลาเรียกเอง — ส่งข้อความที่ค้างทั้งหมดรวมเป็นข้อความเดียว */
function lineFlush() {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  let q;
  try {
    const p = PropertiesService.getScriptProperties();
    try { q = JSON.parse(p.getProperty('LINE_QUEUE') || '[]'); } catch (e) { q = []; }
    p.deleteProperty('LINE_QUEUE');
  } finally { lock.releaseLock(); }
  if (q.length) linePush_(q.join('\n\n━━━━━━━━━━\n\n'));
}

// ======================= Webhook: ลงทะเบียนกลุ่ม =======================
/** doPost ส่งคำขอจาก LINE มาที่นี่ (มี destination + events) */
function lineWebhook_(body) {
  console.log('LINE webhook: ' + (body.events || []).length + ' event(s) ' + JSON.stringify((body.events || []).map(e => [e.type, (e.source || {}).type, e.message && e.message.text])));
  (body.events || []).forEach(ev => {
    try {
      const src = ev.source || {}, id = src.groupId || src.roomId || src.userId;
      if (id) PropertiesService.getScriptProperties().setProperty('LINE_LAST_ID', id);   // ID ห้องล่าสุดที่คุยกับบอท (คัดลอกไปใส่ LINE_TO ได้)
      const text = ev.type === 'message' && ev.message && ev.message.type === 'text' ? String(ev.message.text).trim() : '';
      const wantReg = /^(ลงทะเบียน|register)$/i.test(text), wantId = /^(id|ไอดี)$/i.test(text);
      if (!ev.replyToken || !id || !(ev.type === 'join' || wantReg || wantId)) return;
      const cur = prop_('LINE_TO', '');
      let msg;
      if (ev.type === 'join') msg = 'สวัสดีครับ CHAT BOT ขสอ. 602 LOG BOOK\nพิมพ์ "ลงทะเบียน" เพื่อรับการแจ้งเตือนในกลุ่มนี้';
      else if (wantId) msg = 'ID ของห้องนี้:\n' + id;
      else if (!cur) msg = '✅ ลงทะเบียนห้องนี้รับการแจ้งเตือน 602 LOG BOOK แล้ว';
      else if (cur.split(',').includes(id)) msg = 'ห้องนี้ลงทะเบียนรับการแจ้งเตือนอยู่แล้ว';
      else msg = 'มีห้องอื่นรับการแจ้งเตือนอยู่แล้ว\nให้ ADMIN เพิ่ม ID นี้ใน Script Properties → LINE_TO (คั่นด้วยจุลภาค):\n' + id;
      // ตอบกลับด้วย replyToken ได้เฉพาะคำขอจาก LINE จริง → ใช้ยืนยันก่อนบันทึก LINE_TO
      const ok = lineReply_(ev.replyToken, msg);
      if (ok && wantReg && !cur) PropertiesService.getScriptProperties().setProperty('LINE_TO', id);
    } catch (err) { console.error('LINE webhook: ' + err); }
  });
  return ContentService.createTextOutput('OK');
}
function lineReply_(replyToken, text) {
  const token = prop_('LINE_TOKEN', ''); if (!token) return false;
  const res = UrlFetchApp.fetch(LINE_API + 'reply', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  const ok = res.getResponseCode() === 200;
  console.log('LINE reply ' + res.getResponseCode() + (ok ? '' : ': ' + res.getContentText()));
  return ok;
}

// ======================= เรียกเองจากหน้า Apps Script =======================
/** ตั้ง/ยกเลิกตัวตั้งเวลาโหมดรวมข้อความ ตามค่า LINE_DIGEST_MIN */
function lineSetup() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'lineFlush').forEach(t => ScriptApp.deleteTrigger(t));
  const m = +prop_('LINE_DIGEST_MIN', 0);
  if ([1, 5, 10, 15, 30].includes(m)) ScriptApp.newTrigger('lineFlush').timeBased().everyMinutes(m).create();
  console.log(m ? 'โหมดรวมข้อความทุก ' + m + ' นาที' : 'โหมดส่งทันที');
}
/** ส่งข้อความทดสอบ (ตัวอย่างตามแบบ 2.1) */
function lineTest() {
  if (!prop_('LINE_TOKEN', '')) return console.warn('ยังไม่มี LINE_TOKEN ใน Script Properties');
  if (!prop_('LINE_TO', '')) return console.warn('สิทธิ์ผ่านแล้ว ✓ · ยังไม่มีกลุ่มปลายทาง — ตั้ง Webhook แล้วพิมพ์ "ลงทะเบียน" ในกลุ่ม LINE ก่อน จากนั้น Run lineTest อีกครั้ง');
  linePush_(msgNewEntry_({ recorder: 'ทดสอบระบบ', type: 'dechochai', scope: 'domestic', mission: 'ทดสอบการแจ้งเตือน LINE',
    route: 'ดอนเมือง-บน.4-ดอนเมือง', hours: 2, pax: 50, cargo: 120, flights: 2, note: '', adminMsg: '' }));
  console.log('ส่งแล้ว — ตรวจในกลุ่ม LINE');
}
