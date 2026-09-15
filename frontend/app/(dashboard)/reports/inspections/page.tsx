"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function InspectionsReportPage() {
  const hero = usePageHero("reports/inspections");
  return <ReportPage resource="inspections" hero={hero} />;
}