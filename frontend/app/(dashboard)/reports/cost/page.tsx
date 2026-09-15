"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function CostReportPage() {
  const hero = usePageHero("reports/cost");
  return <ReportPage resource="cost" hero={hero} />;
}