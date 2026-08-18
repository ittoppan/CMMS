"use client";

import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Heading, Text } from "@astryxdesign/core/Text";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";
import { PlusIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
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
    <VStack gap={6}>
      <div className="cmms-page-hero flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <VStack gap={1}>
          <Text type="body" size="sm" className="cmms-eyebrow" style={{ color: "rgba(255,255,255,0.6)" }}>ASSETS CREATE · CMMS-TOPPAN</Text>
          <HStack gap={3} vAlign="center" wrap="wrap">
            <Heading level={2} style={{ color: "#fff" }}>{t("form.assets_create_title")}</Heading>
            <span className="cmms-andon-chip" style={{ background: "rgba(255,255,255,0.12)" }}>
              <ClipboardDocumentIcon className="w-3.5 h-3.5" /> {t("form.registration_form")}
            </span>
          </HStack>
          <Text type="body" style={{ color: "rgba(255,255,255,0.78)" }}>
            {t("hero.assets_create_desc")}
          </Text>
        </VStack>
        <a href="/assets" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-white/10 border border-white/20 hover:bg-white/20 transition-all duration-300">
          <PlusIcon className="w-4 h-4" />
          {t("action.reverse_entry")}
        </a>
      </div>

      <Card padding={6}>
        <Grid columns={2} gap={4}>
          <TextInput label={t("form.asset_code_req")} value="" placeholder={t("placeholder.asset_code")}  />
          <TextInput label={t("form.asset_name_req")} value="" placeholder={t("placeholder.asset_name")}  />
          <Selector label={t("form.category_req")} options={categoryOptions} placeholder={t("form.select_category")} />
          <Selector label={t("form.department_req")} options={departmentOptions} placeholder={t("form.select_department")} />
          <TextInput label={t("form.install_location")} value="" placeholder={t("placeholder.address")}  />
          <DateInput label={t("form.install_date")} />
          <TextInput label={t("field.manufacturer")} value="" placeholder={t("placeholder.manufacturer")}  />
          <TextInput label={t("field.model")} value="" placeholder={t("placeholder.model")}  />
        </Grid>
      </Card>

      <HStack gap={3} hAlign="end">
        <a href="/assets" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all duration-300">
          {t("action.cancel")}
        </a>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white cmms-btn-primary"
        >
          <PlusIcon className="w-4 h-4" />
          {t("form.assets_save")}
        </button>
      </HStack>
    </VStack>
  );
}
