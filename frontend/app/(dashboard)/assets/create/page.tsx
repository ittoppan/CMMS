"use client";

// assets/create — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Select, Lucide)
// ฟอร์มลงทะเบียนทรัพย์สิน (หน้านิ่ง — ไม่มี state/submit เดิม)

import { Grid } from "@/components/layout";
import { PageShell } from "@/components/PageShell";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, ClipboardList } from "lucide-react";
import { t } from "@/lib/i18n";

const categoryOptions = [
  { value: "pump", label: t("field.pump") },
  { value: "compressor", label: t("field.compressor") },
  { value: "motor", label: t("field.motor") },
  { value: "heat-exchanger", label: t("field.heat_exchanger") },
  { value: "boiler", label: t("field.boiler") },
  { value: "conveyor", label: t("field.conveyor") },
  { value: "machine", label: t("field.asset") },
  { value: "electrical", label: t("form.equipment_electrical") },
];

const departmentOptions = [
  { value: "production", label: t("form.dept_production") },
  { value: "utilities", label: t("form.dept_utilities") },
  { value: "fabrication", label: t("form.dept_assembly") },
  { value: "facility", label: t("form.dept_building") },
  { value: "logistics", label: t("form.dept_warehouse") },
];

export default function CreateAssetPage() {
  return (
    <PageShell
      breadcrumbs={[{ label: "หน้าแรก", href: "/dashboard" }, { label: "เครื่องจักร", href: "/asset_registry" }, { label: t("form.assets_create_title") }]}
      title={t("form.assets_create_title")}
      description={t("hero.assets_create_desc")}
      actions={
        <>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <ClipboardList size={14} strokeWidth={1.75} aria-hidden="true" />
            {t("form.registration_form")}
          </span>
          <Link
            href="/assets"
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] px-4 text-sm font-semibold text-[var(--cmms-text-primary)] transition-colors hover:bg-[var(--cmms-bg-wash)]"
          >
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {t("action.reverse_entry")}
          </Link>
        </>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>{t("form.assets_create_title")}</CardTitle>
          <CardDescription>{t("form.registration_form")} · ช่องที่มี * จำเป็นต้องกรอก</CardDescription>
        </CardHeader>
        <CardContent>
          <Grid columns={{ minWidth: 260, max: 2 }} gap={4}>
            <div className="space-y-1.5">
              <Label htmlFor="asset-code">{t("form.asset_code_req")}</Label>
              <Input
                id="asset-code"
                label={t("form.asset_code_req")}
                isLabelHidden
                placeholder={t("placeholder.asset_code")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="asset-name">{t("form.asset_name_req")}</Label>
              <Input
                id="asset-name"
                label={t("form.asset_name_req")}
                isLabelHidden
                placeholder={t("placeholder.asset_name")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("form.category_req")}</Label>
              <Select>
                <SelectTrigger aria-label={t("form.category_req")}>
                  <SelectValue placeholder={t("form.select_category")} />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("form.department_req")}</Label>
              <Select>
                <SelectTrigger aria-label={t("form.department_req")}>
                  <SelectValue placeholder={t("form.select_department")} />
                </SelectTrigger>
                <SelectContent>
                  {departmentOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="install-location">{t("form.install_location")}</Label>
              <Input
                id="install-location"
                label={t("form.install_location")}
                isLabelHidden
                placeholder={t("placeholder.address")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="install-date">{t("form.install_date")}</Label>
              <Input
                id="install-date"
                type="date"
                label={t("form.install_date")}
                isLabelHidden
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manufacturer">{t("field.manufacturer")}</Label>
              <Input
                id="manufacturer"
                label={t("field.manufacturer")}
                isLabelHidden
                placeholder={t("placeholder.manufacturer")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model">{t("field.model")}</Label>
              <Input
                id="model"
                label={t("field.model")}
                isLabelHidden
                placeholder={t("placeholder.model")}
              />
            </div>
          </Grid>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Link
            href="/assets"
            className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--cmms-radius)] border border-[var(--cmms-border)] bg-[var(--cmms-bg-muted)] px-4 text-sm font-semibold text-[var(--cmms-text-primary)] transition-colors hover:bg-[var(--cmms-bg-wash)]"
          >
            {t("action.cancel")}
          </Link>
          <Button>
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
            {t("form.assets_save")}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}
