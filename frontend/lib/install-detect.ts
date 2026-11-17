/**
 * install-detect.ts — ตรรกะตรวจ "เครื่องนี้ติดตั้ง PWA ได้ไหม / ต้องทำอย่างไร"
 * ใช้โดยหน้า /install (public) — แยกจาก UI เพื่อให้แก้/ทดสอบที่เดียว
 *
 * กติกาที่สำคัญ (ห้ามลืม):
 * - PWA ติดตั้งได้เฉพาะ secure context (https หรือ localhost) → โหมด `insecure`
 * - เปิดในแอป LINE / WebView ติดตั้งไม่ได้ → โหมด `in-app` (QR ที่สแกนจากใน LINE จะมาทางนี้)
 * - iOS ติดตั้งได้เฉพาะ Safari (โหมด `ios-safari`) — Chrome/Edge บน iOS ทำไม่ได้
 * - Android Chrome จะมี `beforeinstallprompt` (โหมด `promptable`) ให้กดปุ่มติดตั้งจริง
 *
 * หมายเหตุตอนพัฒนา: PwaRegister ไม่ register SW ใน dev → Chrome จะไม่ยิง
 * `beforeinstallprompt` บน localhost dev (จะเห็นโหมด `android`/`desktop` แทน)
 */

export type InstallPlatform = "android" | "ios" | "desktop" | "other";

export type InstallBrowser =
  | "line"
  | "chrome"
  | "edge"
  | "samsung"
  | "firefox"
  | "safari"
  | "other";

export type InstallMode =
  /** เปิดจากไอคอนที่ติดตั้งแล้ว */
  | "installed"
  /** ยังไม่ใช่ https → ติดตั้งไม่ได้เลย */
  | "insecure"
  /** เปิดใน LINE / WebView → ต้องออกไปเปิด Safari/Chrome ก่อน */
  | "in-app"
  /** มี beforeinstallprompt → กดปุ่มติดตั้งได้จริง */
  | "promptable"
  /** iOS + Safari → แชร์ → เพิ่มไปหน้าจอโฮม */
  | "ios-safari"
  /** iOS + เบราว์เซอร์อื่น (Chrome/Edge/Firefox บน iOS) → ต้องเปิด Safari */
  | "ios-other-browser"
  /** Android ที่ไม่มี prompt → เมนู ⋮ */
  | "android"
  /** คอมพิวเตอร์ → ไอคอนติดตั้งบน address bar */
  | "desktop";

export interface InstallEnv {
  userAgent: string;
  /** เปิดจากไอคอนที่ติดตั้งแล้ว (display-mode standalone/fullscreen หรือ navigator.standalone) */
  standalone: boolean;
  /** window.isSecureContext — https/localhost */
  secure: boolean;
  /** มี beforeinstallprompt ที่ยังไม่ได้ใช้ */
  canPrompt: boolean;
  maxTouchPoints: number;
}

/** event ที่ Chrome/Edge ยิงก่อนติดตั้งได้ (ไม่ใช่มาตรฐาน DOM — ต้องประกาศ type เอง) */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type InstallPromptResult = "accepted" | "dismissed" | "unavailable" | "error";

export const INSTALL_PROMPT_EVENT = "cmms:install-prompt-ready";

export function detectPlatform(
  userAgent: string,
  maxTouchPoints: number = 0
): InstallPlatform {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPod/i.test(userAgent)) return "ios";
  // iPadOS 13+ ส่ง UA เป็น Macintosh — แยกด้วยจำนวนจุดสัมผัส
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return "ios";
  if (/Windows|Macintosh|Linux|CrOS/i.test(userAgent)) return "desktop";
  return "other";
}

export function detectBrowser(userAgent: string): InstallBrowser {
  if (/Line\/[\d.]+/i.test(userAgent)) return "line";
  if (/Edg(?:e|A|iOS)?\//i.test(userAgent)) return "edge";
  if (/SamsungBrowser\//i.test(userAgent)) return "samsung";
  if (/Firefox\/|FxiOS\//i.test(userAgent)) return "firefox";
  if (/Chrome\/|CriOS\//i.test(userAgent)) return "chrome";
  if (/Safari\//i.test(userAgent)) return "safari";
  return "other";
}

/**
 * in-app browser ที่ติดตั้ง PWA ไม่ได้ — คืนชื่อแอป หรือ null
 * (LINE เป็นเคสหลักของเรา: สแกน QR ในแชท/กล้อง LINE จะเปิดในเบราว์เซอร์ของ LINE)
 */
export function detectInAppBrowser(userAgent: string): string | null {
  if (/Line\/[\d.]+/i.test(userAgent)) return "LINE";
  if (/FBAN\/|FBAV\/|FB_IAB\//i.test(userAgent)) return "Facebook";
  if (/Instagram/i.test(userAgent)) return "Instagram";
  if (/TikTok|BytedanceWebview|musical_ly/i.test(userAgent)) return "TikTok";
  if (/; wv\)/i.test(userAgent)) return "Android WebView";
  return null;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof window.matchMedia === "function") {
    for (const mode of ["standalone", "fullscreen"]) {
      if (window.matchMedia(`(display-mode: ${mode})`).matches) return true;
    }
  }
  // iOS Safari ใช้อันนี้แทน display-mode
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** เก็บ event ที่ดักไว้ในระดับ module — กันพลาดตอน event ยิงก่อน React mount */
let capturedPrompt: BeforeInstallPromptEvent | null = null;

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    // ซ่อน mini-infobar ของ Chrome — ให้ปุ่มในหน้า /install เป็น CTA เดียว
    event.preventDefault();
    capturedPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event(INSTALL_PROMPT_EVENT));
  });
}

export function hasInstallPrompt(): boolean {
  return capturedPrompt !== null;
}

/** subscribe event "ติดตั้งได้แล้ว" — คืนฟังก์ชัน unsubscribe */
export function onInstallPromptReady(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(INSTALL_PROMPT_EVENT, cb);
  return () => window.removeEventListener(INSTALL_PROMPT_EVENT, cb);
}

/** เรียก prompt ติดตั้งจริง — ใช้ได้ครั้งเดียวต่อ event */
export async function promptInstall(): Promise<InstallPromptResult> {
  const event = capturedPrompt;
  if (!event) return "unavailable";
  try {
    await event.prompt();
    const choice = await event.userChoice;
    capturedPrompt = null;
    return choice.outcome === "accepted" ? "accepted" : "dismissed";
  } catch {
    return "error";
  }
}

export function readInstallEnv(): InstallEnv {
  const nav = typeof navigator === "undefined" ? null : navigator;
  return {
    userAgent: nav?.userAgent ?? "",
    standalone: isStandalone(),
    secure: typeof window === "undefined" ? true : window.isSecureContext !== false,
    canPrompt: hasInstallPrompt(),
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
  };
}

export function detectInstallMode(env: InstallEnv): InstallMode {
  if (env.standalone) return "installed";
  if (!env.secure) return "insecure";
  if (detectInAppBrowser(env.userAgent)) return "in-app";
  if (env.canPrompt) return "promptable";
  const platform = detectPlatform(env.userAgent, env.maxTouchPoints);
  if (platform === "ios") {
    return detectBrowser(env.userAgent) === "safari" ? "ios-safari" : "ios-other-browser";
  }
  if (platform === "android") return "android";
  return "desktop";
}

const PLATFORM_LABEL: Record<InstallPlatform, string> = {
  android: "Android",
  ios: "iPhone/iPad",
  desktop: "คอมพิวเตอร์",
  other: "ไม่ทราบชนิดเครื่อง",
};

const BROWSER_LABEL: Record<InstallBrowser, string> = {
  line: "LINE",
  chrome: "Chrome",
  edge: "Edge",
  samsung: "Samsung Internet",
  firefox: "Firefox",
  safari: "Safari",
  other: "เบราว์เซอร์อื่น",
};

/** ข้อความสรุป "ตรวจพบ: Android · Chrome" ไว้ให้ผู้ใช้บอก support ได้ */
export function describeEnv(env: InstallEnv): string {
  const platform = PLATFORM_LABEL[detectPlatform(env.userAgent, env.maxTouchPoints)];
  const inApp = detectInAppBrowser(env.userAgent);
  const browser = inApp ?? BROWSER_LABEL[detectBrowser(env.userAgent)];
  return `${platform} · ${browser}`;
}

/**
 * intent:// บังคับเปิด Chrome บน Android (LINE in-app → Chrome)
 * ใช้เฉพาะ Android — iOS ทำแบบนี้ไม่ได้ ต้องให้ผู้ใช้กดเอง
 */
export function androidChromeIntent(url: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const scheme = u.protocol.replace(":", "");
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${scheme};package=com.android.chrome;end`;
  } catch {
    return null;
  }
}
