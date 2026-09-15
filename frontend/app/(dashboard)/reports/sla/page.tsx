"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function SlaReportPage() {
  const hero = usePageHero("reports/sla");
  return <ReportPage resource="sla" hero={hero} defaultGroupBy="department" />;
}