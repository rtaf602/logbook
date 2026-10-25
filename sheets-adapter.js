/**
 * ตัวเชื่อมหน้าเว็บกับ Google Sheets (ผ่าน Apps Script Web app)
 * ให้หน้าเว็บเรียกฐานข้อมูลแบบเดียวกับตอนอยู่ใน claude.ai (window.claude.use("db") / "downloads")
 * โดยข้อมูลจริงอ่าน–เขียนที่ไฟล์ "602DB_LOG BOOK ปีงบXX_ต้นทาง"
 */
(function () {
  "use strict";
  const CFG = window.LOGBOOK_CONFIG || {};
  const APIS = {};
  Object.entries(CFG.API || {}).forEach(([fy, url]) => { if (/^https:\/\/script\.google(usercontent)?\.com\//.test(url || "")) APIS[+fy] = url; });
  const FYS = Object.keys(APIS).map(Number).sort((a, b) => a - b);
  const LATEST = FYS[FYS.length - 1];
  const POLL = Math.max(10, +CFG.POLL_SECONDS || 30) * 1000;
  window.LOGBOOK_STANDALONE = true;

  const fyOfYm = ym => { const [y, m] = String(ym).split("-").map(Number); return m >= 10 ? y + 544 : y + 543; };
  const fail = (msg, code) => { const e = new Error(msg); e.code = code || "error"; e.fromServer = true; return e; };

  // รอให้ผู้ใช้ใส่รหัสเข้าใช้งานก่อน (ทุกคำขอส่งรหัสไปให้เซิร์ฟเวอร์ตรวจ)
  let unlock; const unlocked = new Promise(r => { unlock = r; });
  window.addEventListener("logbook:unlocked", () => unlock());

  async function call(fy, action, payload) {
    const url = APIS[fy];
    if (!url) throw fail("ยังไม่ได้ตั้งค่าฐานข้อมูลของปีงบ " + fy + " (config.js)", "unavailable");
    await unlocked;
    const body = JSON.stringify(Object.assign({ action, key: window.__entryPass || "", admin: window.__adminPass || "" }, payload || {}));
    let res;
    try { res = await fetch(url, { method: "POST", body, redirect: "follow" }); }
    catch (e) { throw fail("เชื่อมต่อฐานข้อมูลไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่", "network"); }
    let j; try { j = await res.json(); } catch (e) { throw fail("ฐานข้อมูลตอบกลับไม่ถูกต้อง (ตรวจการ Deploy Web app)", "bad_response"); }
    if (!j.ok) throw fail(j.error || "เกิดข้อผิดพลาด", j.code);
    return j;
  }

  // ---------- ภารกิจ: โหลดทั้งปีงบครั้งเดียว แล้วแจกให้ทุกเดือนที่หน้าเว็บติดตามอยู่ ----------
  const FY = {};
  const fyState = fy => FY[fy] || (FY[fy] = { byYm: {}, loaded: false, subs: new Set(), busy: null });
  function emitFy(fy) { fyState(fy).subs.forEach(s => { try { s.fire(); } catch (e) { } }); }
  function refreshFy(fy) {
    const s = fyState(fy);
    if (!APIS[fy]) { s.loaded = true; s.byYm = {}; emitFy(fy); return Promise.resolve(); }
    if (s.busy) return s.busy;
    s.busy = call(fy, "entries").then(j => {
      const by = {}; (j.entries || []).forEach(e => { (by[e.ym] = by[e.ym] || []).push(e); });
      s.byYm = by; s.loaded = true; emitFy(fy);
    }).catch(err => { s.subs.forEach(x => x.err && x.err(err)); }).finally(() => { s.busy = null; });
    return s.busy;
  }
  const snapOf = rows => ({ docs: (rows || []).map(r => ({ id: r.id, exists: true, data: () => Object.assign({}, r) })) });

  // ---------- เอกสารเดี่ยว: สนามบิน / รายการตัวเลือก / ชั่วโมงจัดสรร ----------
  const DOCS = {};
  function docState(path) { return DOCS[path] || (DOCS[path] = { subs: new Set(), value: undefined, busy: null }); }
  async function loadDoc(path) {
    if (path === "config/airports") { const j = await call(LATEST, "airports"); return j.airports; }
    if (path === "config/lists") { const j = await call(LATEST, "lists"); return j.lists; }
    const m = /^adminalloc\/fy(\d+)$/.exec(path);
    if (m) { const fy = +m[1]; if (!APIS[fy]) return null; const j = await call(fy, "alloc"); const a = j.alloc;
      return a && a.groups && Object.keys(a.groups).length ? a : null; }
    return null;
  }
  function refreshDoc(path) {
    const s = docState(path); if (s.busy) return s.busy;
    s.busy = loadDoc(path).then(v => { s.value = v; s.subs.forEach(x => x.fire()); })
      .catch(err => s.subs.forEach(x => x.err && x.err(err))).finally(() => { s.busy = null; });
    return s.busy;
  }
  const docSnap = v => ({ exists: v != null, data: () => (v == null ? undefined : JSON.parse(JSON.stringify(v))) });

  const pendingDel = {};   // ชื่อผู้ลบ (หน้าเว็บส่งมาก่อนสั่งลบ)

  function entriesCollection(ym) {
    const fy = fyOfYm(ym);
    return {
      onSnapshot(next, err) {
        const s = fyState(fy), sub = { fire: () => next(snapOf(s.byYm[ym])), err };
        s.subs.add(sub);
        if (s.loaded) setTimeout(sub.fire, 0); else refreshFy(fy);
        return () => s.subs.delete(sub);
      },
      async get() { await refreshFy(fy); return snapOf(fyState(fy).byYm[ym]); },
      async add(data) { const j = await call(fy, "save", { ym, data }); refreshFy(fy); return { id: j.id }; },
      doc(id) { return entryDoc(ym, id); },
    };
  }
  function entryDoc(ym, id) {
    const fy = fyOfYm(ym);
    return {
      async set(data) { await call(fy, "save", { ym, id, data }); await refreshFy(fy); },
      async delete() { const p = pendingDel[id] || {}; delete pendingDel[id];
        await call(fy, "delete", { ym, id, byName: p.deletedByName || "" }); await refreshFy(fy); },
    };
  }
  const db = {
    collection(path) {
      const m = /^months\/(\d{4}-\d{2})\/entries$/.exec(path);
      if (m) return entriesCollection(m[1]);
      if (path === "deletions") return { async add(o) { if (o && o.entryId) pendingDel[o.entryId] = o; return { id: "pending" }; } };
      throw fail("ไม่รองรับ " + path);
    },
    doc(path) {
      const m = /^months\/(\d{4}-\d{2})\/entries\/([^/]+)$/.exec(path);
      if (m) return entryDoc(m[1], m[2]);
      return {
        onSnapshot(next, err) {
          const s = docState(path), sub = { fire: () => next(docSnap(s.value)), err };
          s.subs.add(sub);
          if (s.value !== undefined) setTimeout(sub.fire, 0); else refreshDoc(path);
          return () => s.subs.delete(sub);
        },
        async set(obj) {
          const a = /^adminalloc\/fy(\d+)$/.exec(path);
          if (a) await call(+a[1], "setAlloc", { fy: +a[1], groups: obj.groups || {}, byName: obj.updatedByName || "" });
          else if (path === "config/lists") { const L = Object.assign({}, obj); const by = L.updatedByName || ""; delete L.updatedByName;
            await call(LATEST, "setLists", { lists: L, byName: by }); }
          else throw fail("ไม่รองรับการบันทึก " + path);
          await refreshDoc(path);
        },
      };
    },
  };

  // ดึงข้อมูลใหม่เป็นระยะ และทันทีเมื่อกลับมาที่หน้านี้
  const pollAll = () => {
    if (document.visibilityState !== "visible") return;
    Object.keys(FY).forEach(fy => { if (FY[fy].subs.size) refreshFy(+fy); });
    Object.keys(DOCS).forEach(p => { if (DOCS[p].subs.size && p !== "config/airports") refreshDoc(p); });
  };
  setInterval(pollAll, POLL);
  document.addEventListener("visibilitychange", pollAll);

  // ดาวน์โหลดไฟล์ (Excel / รูปกราฟ) แบบปกติของเบราว์เซอร์
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: "saved" };
    },
  };

  window.claude = { use: async name => name === "db" ? (FYS.length ? db : null) : name === "downloads" ? downloads : null };
})();
