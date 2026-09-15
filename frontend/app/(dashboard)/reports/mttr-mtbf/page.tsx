"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function MttrMtbfReportPage() {
  const hero = usePageHero("reports/mttr-mtbf");
  return <ReportPage resource="mttr-mtbf" hero={hero} />;
}