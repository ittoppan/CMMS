"use client";

import ApprovalCenterPage from "../page";
import { usePageHero } from "@/lib/i18n";

export default function ApprovalCenterSubPage() {
  const hero = usePageHero("approval/center");

  return <ApprovalCenterPage />;
}
