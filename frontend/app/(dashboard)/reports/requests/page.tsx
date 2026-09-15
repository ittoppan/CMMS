"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function RequestsReportPage() {
  const hero = usePageHero("reports/requests");
  return <ReportPage resource="requests" hero={hero} />;
}