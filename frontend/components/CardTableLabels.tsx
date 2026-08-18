"use client";

import { useEffect } from "react";

/**
 * CardTableLabels — เตรียมตารางให้เป็น "การ์ดสไลด์" บนมือถือ (CSS-only)
 *
 * Astryx Table เป็น <table> semantic (thead th + tbody td) แต่ไม่มีโหมดการ์ด
 * วิธีทำ: ฉีด data-label ให้ทุก <td> จากชื่อคอลัมน์ใน <thead> (คอลัมน์เดียวกัน)
 * แล้ว CSS (.cmms-card-table ที่ media query มือถือ) จะ:
 *   - ซ่อน thead
 *   - แปลงแต่ละแถวเป็นบัตรการ์ด (มุมมน + ขอบ)
 *   - แสดงชื่อคอลัมน์เป็นป้ายหัวข้อเหนือค่าของทุก cell
 * ใช้ MutationObserver คอยแท็กตารางที่ mount หลังโหลดข้อมูล (fetch เสร็จ) ด้วย
 */
export default function CardTableLabels() {
  useEffect(() => {
    let raf = 0;

    const tagTable = (table: HTMLTableElement) => {
      const thead = table.querySelector("thead");
      const rows = table.querySelectorAll("tbody tr");
      if (!thead || rows.length === 0) return;

      const headers = Array.from(thead.querySelectorAll("th")).map((th) =>
        th.textContent?.trim() ?? ""
      );
      if (headers.length === 0) return;

      table.classList.add("cmms-card-table");

      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        cells.forEach((td, i) => {
          const label = headers[i] || "";
          if (!label) return;
          if (td.getAttribute("data-label") === label) return; // idempotent
          td.setAttribute("data-label", label);
        });
      });
    };

    const scan = () => {
      document
        .querySelectorAll<HTMLTableElement>(
          ".astryx-layout-content table:not(.cmms-card-table)"
        )
        .forEach(tagTable);
    };

    const observer = new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(scan);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    scan();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  return null;
}
