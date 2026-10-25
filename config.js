/**
 * ตั้งค่าเว็บ 602 LOG BOOK
 * API: ลิงก์ Web app ของ Apps Script (Deploy → Web app → URL ที่ลงท้ายด้วย /exec)
 * ใส่ครั้งเดียว ใช้ได้ทุกปีงบ — ขึ้นปีงบใหม่ให้ ADMIN เพิ่มจากหน้าเว็บ (ภาพรวม / สรุปข้อมูล → เพิ่มปีงบใหม่)
 */
window.LOGBOOK_CONFIG = {
  API: "https://script.google.com/macros/s/AKfycbxjTaBUDijNafQzpLSHZJB-59KVD29Zy6h-CEY81DCaNMPVTwsAsMRfuKCCPa3ecsWx/exec",
  POLL_SECONDS: 30,      // ดึงข้อมูลใหม่ทุกกี่วินาที (ขณะเปิดหน้าอยู่)
};
