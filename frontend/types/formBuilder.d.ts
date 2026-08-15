/**
 * Type declarations for kevinchappell/formBuilder (jQuery plugin, UMD, ไม่มี types ทางการ)
 *
 * ไฟล์นี้ต้องเป็น GLOBAL SCRIPT (ห้าม import/export) เพื่อให้ ambient module
 * declaration ครอบ import("formBuilder") ได้ แม้ชื่อจะ resolve ไปที่ .js ที่ไม่มี types
 *
 * ใช้งาน: ตั้ง global jQuery ก่อน แล้ว import side-effect
 *   (window as any).jQuery = $;
 *   await import("formBuilder");
 */
declare module "formBuilder";
declare module "formBuilder/dist/form-builder.min";
declare module "jquery-ui-sortable";
