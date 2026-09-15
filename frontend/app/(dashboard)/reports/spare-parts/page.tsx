"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function SparePartsReportPage() {
  const hero = usePageHero("reports/spare-parts");
  return <ReportPage resource="spare-parts" hero={hero} />;
}