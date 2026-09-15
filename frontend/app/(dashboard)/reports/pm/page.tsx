"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function PmReportPage() {
  const hero = usePageHero("reports/pm");
  return <ReportPage resource="pm" hero={hero} />;
}