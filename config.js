/**
 * ตั้งค่าเว็บ 602 LOG BOOK
 * API: ลิงก์ Web app ของ Apps Script ในไฟล์ "ต้นทาง" แยกตามปีงบ (ได้จาก Deploy → Web app → URL ที่ลงท้ายด้วย /exec)
 * ขึ้นปีงบใหม่: สร้างไฟล์ต้นทางปีใหม่ ติดตั้งสคริปต์ แล้วเพิ่มบรรทัดใหม่ เช่น 2571: "https://script.google.com/macros/s/.../exec"
 */
window.LOGBOOK_CONFIG = {
  API: {
    2570: "https://script.google.com/macros/s/AKfycbxjTaBUDijNafQzpLSHZJB-59KVD29Zy6h-CEY81DCaNMPVTwsAsMRfuKCCPa3ecsWx/exec",
  },
  POLL_SECONDS: 30,      // ดึงข้อมูลใหม่ทุกกี่วินาที (ขณะเปิดหน้าอยู่)
};
