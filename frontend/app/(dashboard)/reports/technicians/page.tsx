"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function TechniciansReportPage() {
  const hero = usePageHero("reports/technicians");
  return <ReportPage resource="technicians" hero={hero} />;
}