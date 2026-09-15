"use client";

import { usePageHero } from "@/lib/i18n";
import { ReportPage } from "@/components/reports/report-page";

export default function WorkOrdersReportPage() {
  const hero = usePageHero("reports/work-orders");
  return <ReportPage resource="work-orders" hero={hero} />;
}