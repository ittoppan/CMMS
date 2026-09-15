"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function AssetsReportPage() {
  const hero = usePageHero("reports/assets");
  return <ReportPage resource="assets" hero={hero} />;
}