"use client";

// suppliers/create — migrate ui kit (PageShell, ui/Card, ui/Input, ui/Textarea, ui/Switch)
// business logic ครบเดิม: POST suppliers.php, validation

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import SuccessDialog from "@/components/SuccessDialog";
import { t } from "@/lib/i18n";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus } from "lucide-react";

export default function SupplierCreatePage() {
  const router = useRouter();
  
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [taxId, setTaxId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!name || !code) {
      setError(t("msg.manufacturer_code_name_required"));
      return;
    }
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/v1/suppliers.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          name,
          contact_person: contact,
          email,
          phone,
          address,
          tax_id: taxId,
          is_active: isActive ? 1 : 0
        }),
      });
      const json = await res.json();
      if (json.success || json.id) {
        setSubmitted(true);
      } else {
        setError(json.error || t("msg.supplier_create_error"));
      }
    } catch {
      setError(t("msg.conn_fail_retry"));
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <SuccessDialog
        title={t("msg.supplier_created")}
        message={<>{t("field.supplier")} <strong>{name}</strong> {t("msg.added_successfully")}</>}
        primaryLabel={t("action.back_to_list")}
        onPrimary={() => router.push("/suppliers")}
        onBackdrop={() => router.push("/suppliers")}
      />
    );
  }

  return (
    <PageShell
      breadcrumbs={[
        { label: "หน้าแรก", href: "/dashboard" },
        { label: "ผู้จำหน่าย", href: "/suppliers" },
        { label: t("form.manufacturer_create_title") },
      ]}
      title={t("form.manufacturer_create_title")}
      description={t("hero.manufacturer_create_desc")}
      actions={
        <Button variant="secondary" onClick={() => router.push("/suppliers")}>
          <ArrowLeft className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          {t("action.back")}
        </Button>
      }
    >
      <Card className="mx-auto w-full max-w-[640px]">
        <CardContent className="space-y-5">
          {error && (
            <Alert variant="danger">{error}</Alert>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label htmlFor="supplier-create-code">
                {t("form.reference_code")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="supplier-create-code"
                placeholder={t("placeholder.supplier_code")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="supplier-create-name">
                {t("field.company_name")} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="supplier-create-name"
                placeholder={t("placeholder.company_name")}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-create-contact">{t("field.contact_person")}</Label>
              <Input
                id="supplier-create-contact"
                placeholder={t("form.contact_name")}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-create-phone">{t("field.phone")}</Label>
              <Input
                id="supplier-create-phone"
                type="tel"
                placeholder="02-xxx-xxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="supplier-create-email">{t("field.email")}</Label>
              <Input
                id="supplier-create-email"
                type="email"
                placeholder="contact@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-create-tax-id">{t("field.tax_id")}</Label>
              <Input
                id="supplier-create-tax-id"
                inputMode="numeric"
                placeholder="0123456789012"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier-create-address">{t("field.address")}</Label>
            <Textarea
              id="supplier-create-address"
              placeholder={t("placeholder.doc_address")}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label id="supplier-create-status-label">{t("form.usage_status")}</Label>
            <div className="flex items-center gap-3 pt-1">
              <Switch
                id="supplier-create-status"
                aria-labelledby="supplier-create-status-label"
                label={t("field.active")}
                checked={isActive}
                onChange={(val: boolean) => setIsActive(val)}
              />
              <span className={`text-sm ${isActive ? "font-medium text-[var(--cmms-primary)]" : "text-muted-foreground"}`}>
                {isActive ? t("form.enabled") : t("form.suspend")}
              </span>
            </div>
          </div>
        </CardContent>

        <CardFooter className="justify-end gap-2">
          <Button variant="secondary" onClick={() => router.push("/suppliers")}>
            {t("action.cancel")}
          </Button>
          <Button disabled={loading} onClick={handleSubmit}>
            <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
            {loading ? t("common.saving") : t("action.save_data")}
          </Button>
        </CardFooter>
      </Card>
    </PageShell>
  );
}
