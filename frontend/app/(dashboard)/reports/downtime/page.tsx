"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function DowntimeReportPage() {
  const hero = usePageHero("reports/downtime");
  return <ReportPage resource="downtime" hero={hero} />;
}