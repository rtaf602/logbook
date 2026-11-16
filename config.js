/**
 * ตั้งค่าเว็บ 602 LOG BOOK
 * API: ลิงก์ Web app ของ Apps Script (Deploy → Web app → URL ที่ลงท้ายด้วย /exec)
 * ใส่ครั้งเดียว ใช้ได้ทุกปีงบ — ขึ้นปีงบใหม่ให้ ADMIN เพิ่มจากหน้าเว็บ (ADMIN DATA USING → เพิ่มปีงบใหม่)
 */
window.LOGBOOK_CONFIG = {
  API: "https://script.google.com/macros/s/AKfycbxjTaBUDijNafQzpLSHZJB-59KVD29Zy6h-CEY81DCaNMPVTwsAsMRfuKCCPa3ecsWx/exec",
  // รหัสเว็บนี้ในรายชื่อเว็บของระบบ Login กลาง (หน้า Admin ของ E ADMIN) ต้องตรงกับ CFG.WEB_CODE ใน apps-script/Code.gs
  WEB_CODE: "WEB11",
  POLL_SECONDS: 30,      // ดึงข้อมูลใหม่ทุกกี่วินาที (ขณะเปิดหน้าอยู่)
};
