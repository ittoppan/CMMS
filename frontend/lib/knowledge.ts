"use client";

/**
 * lib/knowledge.ts — Client, Types, Labels ของ Knowledge Center API (Phase 38)
 *
 * เรียก /api/v1/knowledge.php เท่านั้น — business rule ทั้งหมดอยู่ที่
 * src/helpers/knowledge.php ฝั่ง server หน้านี้แค่ถามว่า "อ่าน/เขียนอะไรได้"
 *
 * กฎที่ UI ต้องเคารพ (บังคับที่ server แล้ว ห้ามหวังว่าฝั่ง client กรองให้):
 *   - บทความที่เผยแพร่แล้วแก้ไขไม่ได้ ต้องสร้างฉบับใหม่ (new_version)
 *   - article_key มี 1 ฉบับที่ published ได้เสมอ (knowledge_published_guard)
 *   - ผู้เขียนอนุมัติบทความตัวเองไม่ได้
 *   - restricted/confidential และ draft ของคนอื่น ถูกกรองที่ SQL แล้ว
 *   - usage/ช่องว่างความรู้/การทบทวน เกิดจากการกระทำจริงของผู้ใช้เท่านั้น
 *   - ห้ามคิดเอง: estimated_minutes, ความถี่การใช้งาน, อัตราคำตอบ
 */
import { apiJson } from "./api";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info";

/* ── config / vocab ──────────────────────────────────────────────────────── */

export interface KnConfig {
  enabled: boolean;
  search_include_documents: boolean;
  search_include_manuals: boolean;
  min_query_len: number;
  max_results: number;
  result_window_days: number;
  usage_log_enabled: boolean;
  search_log_enabled: boolean;
  auto_create_gap: boolean;
  gap_min_occurrences: number;
  gap_window_days: number;
  gap_default_priority: string;
  review_default_days: number;
  review_overdue_warn_days: number;
  publish_requires_approved: boolean;
  publish_requires_review: boolean;
  publish_requires_category: boolean;
  publish_requires_relation: boolean;
  auto_check_document_stale: boolean;
  helpfulness_enabled: boolean;
  usage_retention_days: number;
  search_log_retention_days: number;
  page_default_size: number;
  export_row_limit: number;
  privileged_roles: number[];
}

export interface KnCan {
  read: boolean;
  search: boolean;
  create: boolean;
  edit: boolean;
  submit: boolean;
  review: boolean;
  approve: boolean;
  publish: boolean;
  feedback: boolean;
  manage_gaps: boolean;
  taxonomy: boolean;
  usage_view: boolean;
  export: boolean;
}

export interface KnVocab {
  statuses: string[];
  transitions: Record<string, string[]>;
  confidentiality: string[];
  entity_types: string[];
  relation_link_types: string[];
  document_link_types: string[];
  usage_actions: string[];
  helpfulness: string[];
  gap_statuses: string[];
  gap_priorities: string[];
  review_statuses: string[];
  review_triggers: string[];
  devices: string[];
}

export interface KnConfigResponse {
  ok: boolean;
  config: KnConfig;
  can: KnCan;
  vocab: KnVocab;
}

/* ── feature status ──────────────────────────────────────────────────────── */

export interface KnFeatureStatus {
  ok: boolean;
  version: string;
  /** READY | SCHEMA_MISSING | NO_PUBLISHED_KNOWLEDGE | NO_USAGE_YET */
  state: string;
  ready: boolean;
  checks: Record<string, string[]>;
  counts: Record<string, number>;
  settings_seeded: boolean;
  privileged_roles: number[];
}

/* ── catalog ─────────────────────────────────────────────────────────────── */

export interface KnCatalog {
  ok: boolean;
  enabled: boolean;
  status_counts: Record<string, number>;
  total_articles: number;
  published_articles: number;
  by_category: Array<{
    id: number;
    code: string;
    name_th: string;
    name_en: string;
    published: number;
    total: number;
  }>;
  traceability: {
    published_with_relation: number;
    published_without_relation: number;
    note: string | null;
  };
  document_bridge: { stale_references: number };
  usage: {
    events: number;
    helpfulness_answers: number;
    answer_rate_note: string | null;
    searches: number;
    searches_zero_result: number;
    top_used: Array<{ article_id: number; article_key: string; title: string; c: number }>;
  };
  gaps_open: number;
  reviews_due: number;
}

/* ── articles ────────────────────────────────────────────────────────────── */

export interface KnArticle {
  id: number;
  article_key: string;
  version_no: number;
  title: string;
  summary: string | null;
  symptoms: string | null;
  diagnosis: string | null;
  root_cause: string | null;
  resolution: string | null;
  prevention: string | null;
  safety_notes: string | null;
  /** NULL = ยังไม่ได้วัด ห้ามเดา */
  estimated_minutes: number | null;
  requires_isolation: boolean | number;
  category_id: number | null;
  status: string;
  confidentiality: string;
  content_hash: string | null;
  owner_id: number | null;
  author_id: number | null;
  review_cycle_days: number | null;
  next_review_date: string | null;
  review_owner_id: number | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  published_by: number | null;
  published_at: string | null;
  superseded_at: string | null;
  superseded_by_id: number | null;
  archived_at: string | null;
  archive_reason: string | null;
  created_at: string | null;
  updated_at: string | null;
  review_overdue?: boolean;
  review_overdue_days?: number | null;
  allowed_transitions?: string[];
  category_code?: string | null;
  category_name_th?: string | null;
  category_name_en?: string | null;
  usage?: KnUsageSummary;
}

export interface KnVersionRow {
  id: number;
  version_no: number;
  status: string;
  title: string;
  published_at: string | null;
  superseded_at: string | null;
  superseded_by_id: number | null;
}

export interface KnRelation {
  id: number;
  entity_type: string;
  entity_id: string;
  link_type: string;
  note: string | null;
  created_by: number | null;
  created_at: string | null;
  entity_label: string | null;
  /** true = ปลายทางถูกลบไปแล้ว — ความรู้ไม่ถูกแก้ เพราะเหตุการณ์นั้นเกิดจริง */
  target_missing: boolean;
}

export interface KnDocumentRef {
  id: number;
  document_id: number;
  document_revision_id: number | null;
  link_type: string;
  is_stale: boolean | number;
  stale_checked_at: string | null;
  note: string | null;
  created_at: string | null;
  doc_no: string | null;
  document_title: string | null;
  document_status: string | null;
  current_effective_revision_id: number | null;
  written_revision_no: string | null;
  current_effective_revision_no: string | null;
}

export interface KnReview {
  id: number;
  article_id: number;
  article_key?: string | null;
  article_title?: string | null;
  version_no?: number;
  round_no: number;
  trigger_reason: string;
  status: string;
  due_date: string | null;
  reviewer_id: number | null;
  assigned_by: number | null;
  assigned_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  findings: string | null;
  recommendations: string | null;
  outcome_note: string | null;
  new_next_review_date: string | null;
  created_at: string | null;
}

export interface KnArticleDetail {
  ok: boolean;
  article: KnArticle & {
    tags: string[];
    relations: KnRelation[];
    documents: KnDocumentRef[];
    versions: KnVersionRow[];
    reviews?: KnReview[];
  };
}

export interface KnArticleListResponse {
  ok: boolean;
  articles: KnArticle[];
  total: number;
  page: number;
  limit: number;
}

/* ── search ──────────────────────────────────────────────────────────────── */

export interface KnSearchHit {
  id: number;
  article_key: string;
  version_no: number;
  title: string;
  summary: string | null;
  symptoms: string | null;
  diagnosis: string | null;
  resolution: string | null;
  safety_notes: string | null;
  estimated_minutes: number | null;
  requires_isolation: boolean | number;
  status: string;
  confidentiality: string;
  category_id: number | null;
  published_at: string | null;
  next_review_date: string | null;
  category_code?: string | null;
  category_name_th?: string | null;
  category_name_en?: string | null;
  match_rank: number;
}

export interface KnSearchDocHit {
  id: number;
  doc_no: string;
  title: string;
  doc_type: string | null;
  status: string;
  description: string | null;
}

export interface KnGapOpened {
  opened: boolean;
  reason?: string;
  gap_id?: number;
  occurrences?: number;
  min_occurrences?: number;
  normalized_term?: string;
}

export interface KnSearchResponse {
  ok: boolean;
  query: string;
  normalized_query: string;
  results: KnSearchHit[];
  knowledge_count: number;
  documents: KnSearchDocHit[];
  manuals: Array<Record<string, unknown>>;
  /** false = ค้นไม่เจอ (ไม่ใช่ "ระบบไม่รู้") */
  answered: boolean;
  took_ms: number | null;
  search_log_id: number;
  gap_opened: KnGapOpened | null;
}

/* ── usage ───────────────────────────────────────────────────────────────── */

export interface KnUsageSummary {
  total_events: number;
  /** = view + search_hit + open_procedure (feedback ไม่ถูกนับเป็น view) */
  views: number;
  by_action: Record<string, number>;
  by_helpfulness: Record<string, number>;
  answers: number;
  last_used_at: string | null;
  has_usage_data: boolean;
  answer_rate_note: string | null;
}

export interface KnUsageEvent {
  id: number;
  article_id: number;
  article_key: string | null;
  article_title: string | null;
  action: string;
  helpfulness: string | null;
  comment: string | null;
  entity_type: string | null;
  entity_id: string | null;
  asset_id: number | null;
  user_id: number | null;
  device: string | null;
  created_at: string | null;
}

export interface KnUsageEventsResponse {
  ok: boolean;
  events: KnUsageEvent[];
}

/* ── gaps ────────────────────────────────────────────────────────────────── */

export interface KnGap {
  id: number;
  search_term: string;
  normalized_term: string;
  occurrences: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  asset_id: number | null;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  priority: string;
  priority_reason: string | null;
  triaged_by: number | null;
  triaged_at: string | null;
  assigned_to: number | null;
  due_date: string | null;
  resolved_article_id: number | null;
  resolved_by: number | null;
  resolved_at: string | null;
  close_note: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface KnGapListResponse {
  ok: boolean;
  gaps: KnGap[];
  total: number;
  page: number;
  limit: number;
}

export interface KnGapDetail {
  ok: boolean;
  gap: KnGap;
  /** หลักฐานคือบรรทัดค้นหาจริง ไม่ใช่ตัวเลขที่ตั้งไว้ */
  evidence_searches: Array<{
    id: number;
    normalized_query: string;
    result_count: number;
    asset_id: number | null;
    user_id: number | null;
    created_at: string | null;
  }>;
}

export interface KnGapStats {
  ok: boolean;
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  searches_total: number;
  searches_answered: number;
  searches_unanswered_in_window: number;
  top_unanswered_terms: Array<{ normalized_query: string; c: number }>;
  window_days: number;
}

/* ── reviews / taxonomy ──────────────────────────────────────────────────── */

export interface KnReviewsResponse {
  ok: boolean;
  reviews: KnReview[];
  scheduled_due: Array<{
    article_id: number;
    article_key: string;
    title: string;
    status: string;
    next_review_date: string | null;
    days_until: number;
  }>;
}

export interface KnCategory {
  id: number;
  code: string;
  name_th: string;
  name_en: string;
  parent_id: number | null;
  sort_order: number;
  description: string | null;
  is_active: boolean | number;
  article_count?: number;
}

export interface KnTag {
  id: number;
  tag: string;
  label_th: string | null;
  is_active: boolean | number;
  article_count?: number;
}

/* ── export ──────────────────────────────────────────────────────────────── */

export interface KnExportResponse {
  ok: boolean;
  what: string;
  rows: Array<Record<string, unknown>>;
  row_count: number;
  row_limit: number;
  /** true = ตัดที่ row_limit จริง ไม่ได้ครบทุกแถว */
  truncated: boolean;
}

/* ── write payloads ──────────────────────────────────────────────────────── */

export interface KnArticleInput {
  article_key?: string;
  title: string;
  summary?: string | null;
  symptoms?: string | null;
  diagnosis?: string | null;
  root_cause?: string | null;
  resolution?: string | null;
  prevention?: string | null;
  safety_notes?: string | null;
  estimated_minutes?: number | null;
  requires_isolation?: boolean | number;
  category_id?: number | null;
  confidentiality?: string;
  owner_id?: number | null;
  review_cycle_days?: number | null;
  tags?: string[];
}

/* ── fetch helpers ───────────────────────────────────────────────────────── */

function knApi<T>(
  action: string,
  p: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const q = new URLSearchParams();
  q.set("action", action);
  for (const [k, v] of Object.entries(p)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  return apiJson<T>(`/api/v1/knowledge.php?${q.toString()}`);
}

export function fetchKnConfig(): Promise<KnConfigResponse> {
  return knApi<KnConfigResponse>("config");
}

export function fetchKnFeatureStatus(): Promise<KnFeatureStatus> {
  return knApi<KnFeatureStatus>("feature_status");
}

export function fetchKnCatalog(): Promise<KnCatalog> {
  return knApi<KnCatalog>("catalog");
}

export function fetchKnCategories(includeInactive = false): Promise<{ ok: boolean; categories: KnCategory[] }> {
  return knApi("categories", { include_inactive: includeInactive ? 1 : undefined });
}

export function fetchKnTags(includeInactive = false): Promise<{ ok: boolean; tags: KnTag[] }> {
  return knApi("tags", { include_inactive: includeInactive ? 1 : undefined });
}

export interface KnArticleListParams {
  q?: string;
  status?: string;
  category_id?: number;
  confidentiality?: string;
  owner_id?: number;
  tag?: string;
  review_overdue?: boolean;
  include_unpublished?: boolean;
  with_usage?: boolean;
  page?: number;
  page_size?: number;
  limit?: number;
}

export function fetchKnArticles(p: KnArticleListParams = {}): Promise<KnArticleListResponse> {
  return knApi<KnArticleListResponse>("article_list", p as Record<string, string | number | boolean | undefined>);
}

/** id เป็นตัวเลข หรือ article_key ก็ได้ */
export function fetchKnArticle(
  idOrKey: number | string,
  withReviews = false,
): Promise<KnArticleDetail> {
  const isId = typeof idOrKey === "number" || /^\d+$/.test(String(idOrKey));
  return knApi<KnArticleDetail>("article_get", {
    id: isId ? Number(idOrKey) : undefined,
    article_key: isId ? undefined : String(idOrKey),
    with_reviews: withReviews ? 1 : undefined,
  });
}

export interface KnSearchParams {
  asset_id?: number;
  entity_type?: string;
  entity_id?: string;
  window_days?: number;
  device?: string;
  limit?: number;
}

export function searchKn(q: string, p: KnSearchParams = {}): Promise<KnSearchResponse> {
  return knApi<KnSearchResponse>("search", { q, ...(p as Record<string, string | number | undefined>) });
}

export function fetchKnRelated(
  entityType: string,
  entityId: string,
): Promise<{
  ok: boolean;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  target_missing: boolean;
  articles: KnArticle[];
}> {
  return knApi("related", { entity_type: entityType, entity_id: entityId });
}

export function fetchKnUsageSummary(articleId: number): Promise<{ ok: boolean; article_id: number; usage: KnUsageSummary }> {
  return knApi("usage_summary", { article_id: articleId });
}

export function fetchKnUsageEvents(
  p: Partial<KnArticleListParams> & { usage_action?: string; user_id?: number; since?: string } = {},
): Promise<KnUsageEventsResponse> {
  return knApi<KnUsageEventsResponse>("usage_events", p as Record<string, string | number | boolean | undefined>);
}

export function fetchKnGaps(
  p: Partial<KnArticleListParams> & { status?: string; priority?: string; open_only?: boolean } = {},
): Promise<KnGapListResponse> {
  return knApi<KnGapListResponse>("gaps", p as Record<string, string | number | boolean | undefined>);
}

export function fetchKnGap(id: number): Promise<KnGapDetail> {
  return knApi<KnGapDetail>("gap_get", { id });
}

export function fetchKnGapStats(): Promise<KnGapStats> {
  return knApi<KnGapStats>("gap_stats");
}

export function fetchKnReviews(
  p: { status?: string; reviewer_id?: number; open_only?: boolean; limit?: number } = {},
): Promise<KnReviewsResponse> {
  return knApi<KnReviewsResponse>("reviews", p);
}

export function fetchKnReviewDue(limit = 100): Promise<{ ok: boolean; due: Array<Record<string, unknown>> }> {
  return knApi("review_due", { limit });
}

export function exportKn(
  what: "articles" | "usage" | "searches" | "gaps" | "reviews",
): Promise<KnExportResponse> {
  return knApi<KnExportResponse>("export", { what });
}

/* ── mutations (POST + CSRF ผ่าน apiJson) ────────────────────────────────── */

export function knPost<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  return apiJson<T>("/api/v1/knowledge.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createKnArticle(input: KnArticleInput) {
  return knPost<{ ok: boolean; id: number; article_key: string; version_no: number; status: string }>({
    action: "article_create",
    ...input,
  });
}

export function updateKnArticle(id: number, input: Partial<KnArticleInput>) {
  return knPost<{ ok: boolean; id: number; status: string; content_changed?: boolean }>({
    action: "article_update",
    id,
    ...input,
  });
}

export function submitKnArticle(id: number, p: { reviewer_id?: number; trigger_reason?: string } = {}) {
  return knPost<{ ok: boolean; id: number; status: string; review_round: number }>({
    action: "article_submit",
    id,
    ...p,
  });
}

export function approveKnArticle(id: number, findings: string, outcomeNote?: string) {
  return knPost<{ ok: boolean; id: number; status: string }>({
    action: "article_approve",
    id,
    findings,
    outcome_note: outcomeNote || undefined,
  });
}

export function sendBackKnArticle(id: number, reason: string) {
  return knPost<{ ok: boolean; id: number; status: string }>({
    action: "article_send_back",
    id,
    reason,
  });
}

export function publishKnArticle(id: number) {
  return knPost<{ ok: boolean; id: number; status: string; superseded_id?: number }>({
    action: "article_publish",
    id,
  });
}

export function newKnVersion(id: number) {
  return knPost<{ ok: boolean; id: number; article_key: string; version_no: number; status: string }>({
    action: "article_new_version",
    id,
  });
}

export function archiveKnArticle(id: number, reason: string) {
  return knPost<{ ok: boolean; id: number; status: string }>({
    action: "article_archive",
    id,
    reason,
  });
}

export function addKnRelation(
  articleId: number,
  p: { entity_type: string; entity_id: string; link_type: string; note?: string },
) {
  return knPost<{ ok: boolean; id: number; entity_label: string }>({
    action: "relation_add",
    article_id: articleId,
    ...p,
  });
}

export function removeKnRelation(articleId: number, relationId: number) {
  return knPost<{ ok: boolean; id: number }>({
    action: "relation_remove",
    article_id: articleId,
    relation_id: relationId,
  });
}

export function addKnDocumentRef(
  articleId: number,
  p: { document_id: number; document_revision_id?: number; link_type: string; note?: string },
) {
  return knPost<{ ok: boolean; id: number; document_id: number; document_revision_id: number | null }>({
    action: "document_ref_add",
    article_id: articleId,
    ...p,
  });
}

export function removeKnDocumentRef(articleId: number, refId: number) {
  return knPost<{ ok: boolean; id: number }>({
    action: "document_ref_remove",
    article_id: articleId,
    ref_id: refId,
  });
}

export function checkKnDocumentStale(articleId?: number) {
  return knPost<{
    ok: boolean;
    checked: number;
    flagged: Array<{ ref_id: number; article_id: number; document_id: number; doc_no: string; written_revision_id: number | null; current_effective_revision_id: number | null }>;
    cleared: number[];
  }>({ action: "document_stale_check", article_id: articleId });
}

/** บันทึกว่าผู้ใช้คลิกเปิดผลลัพธ์ — เขียนครั้งเดียวต่อผลการค้นหา */
export function clickKnSearchResult(searchLogId: number, articleId: number, device?: string) {
  return knPost<{ ok: boolean; already_recorded?: boolean }>({
    action: "search_click",
    search_log_id: searchLogId,
    article_id: articleId,
    device,
  });
}

export function logKnUsage(
  articleId: number,
  usageAction = "view",
  p: { device?: string; asset_id?: number; entity_type?: string; entity_id?: string } = {},
) {
  return knPost<{ ok: boolean; logged: boolean; id?: number; reason?: string }>({
    action: "usage_log",
    article_id: articleId,
    usage_action: usageAction,
    ...p,
  });
}

export function sendKnFeedback(
  articleId: number,
  helpfulness: "helpful" | "not_helpful" | "no_answer",
  comment?: string,
  device?: string,
) {
  return knPost<{ ok: boolean; article_id: number; helpfulness: string }>({
    action: "usage_feedback",
    article_id: articleId,
    helpfulness,
    comment: comment || undefined,
    device,
  });
}

export function createKnGap(p: {
  term: string;
  asset_id?: number;
  entity_type?: string;
  entity_id?: string;
  priority?: string;
  priority_reason?: string;
}) {
  return knPost<{ ok: boolean; id: number; created: boolean }>({ action: "gap_create", ...p });
}

/** gap_action: triaged | in_progress | prioritize | assign | resolve | close | reject */
export function knGapAction(
  id: number,
  gapAction: string,
  p: {
    priority?: string;
    priority_reason?: string;
    assigned_to?: number;
    due_date?: string;
    resolved_article_id?: number;
    close_note?: string;
  } = {},
) {
  return knPost<{ ok: boolean; id: number; from: string; to: string }>({
    action: "gap_action",
    id,
    gap_action: gapAction,
    ...p,
  });
}

export function requestKnReview(
  articleId: number,
  p: { trigger_reason?: string; reviewer_id?: number; due_date?: string; reason?: string } = {},
) {
  return knPost<{ ok: boolean; id: number; round_no: number }>({
    action: "review_request",
    article_id: articleId,
    ...p,
  });
}

export function startKnReview(id: number) {
  return knPost<{ ok: boolean; id: number; status: string }>({ action: "review_start", id });
}

export function completeKnReview(
  id: number,
  outcome: "approved" | "needs_revision" | "rejected",
  p: { findings: string; recommendations?: string; outcome_note?: string; new_next_review_date?: string } = { findings: "" },
) {
  return knPost<{ ok: boolean; id: number; status: string; new_next_review_date: string | null }>({
    action: "review_complete",
    id,
    outcome,
    ...p,
  });
}

export function saveKnCategory(p: {
  id?: number;
  code: string;
  name_th: string;
  name_en: string;
  parent_id?: number | null;
  sort_order?: number;
  description?: string | null;
  is_active?: boolean | number;
}) {
  return knPost<{ ok: boolean; id: number; code: string }>({ action: "category_save", ...p });
}

export function saveKnTag(p: { id?: number; tag: string; label_th?: string | null; is_active?: boolean | number }) {
  return knPost<{ ok: boolean; id: number; tag: string }>({ action: "tag_save", ...p });
}

/* ── labels / tones ──────────────────────────────────────────────────────── */

export const KN_STATUS_LABELS: Record<string, string> = {
  draft: "ร่าง",
  in_review: "รอทบทวน",
  approved: "อนุมัติแล้ว (ยังไม่เผยแพร่)",
  published: "เผยแพร่แล้ว",
  superseded: "ถูกแทนที่",
  archived: "เก็บถาวร",
};

export const KN_STATUS_TONE: Record<string, Tone> = {
  draft: "neutral",
  in_review: "info",
  approved: "success",
  published: "success",
  superseded: "warning",
  archived: "neutral",
};

export const KN_CONFIDENTIALITY_LABELS: Record<string, string> = {
  internal: "ทั่วไป (Internal)",
  restricted: "จำกัดสิทธิ์ (Restricted)",
  confidential: "ลับ (Confidential)",
};

export const KN_CONFIDENTIALITY_TONE: Record<string, Tone> = {
  internal: "neutral",
  restricted: "warning",
  confidential: "danger",
};

export const KN_HELPFULNESS_LABELS: Record<string, string> = {
  helpful: "ช่วยได้",
  not_helpful: "ไม่ช่วย",
  no_answer: "ไม่ตอบคำถาม",
};

export const KN_USAGE_ACTION_LABELS: Record<string, string> = {
  view: "เปิดอ่าน",
  open_procedure: "เปิดขั้นตอน",
  print: "พิมพ์",
  download: "ดาวน์โหลด",
  copy_link: "คัดลอกลิงก์",
  search_hit: "คลิกจากผลค้นหา",
  acknowledge: "ยืนยันว่าใช้แล้ว",
  feedback: "ให้คะแนน",
};

export const KN_GAP_STATUS_LABELS: Record<string, string> = {
  open: "ยังไม่จัดการ",
  triaged: "คัดกรองแล้ว",
  in_progress: "กำลังทำ",
  resolved: "ปิดแล้ว (มีบทความ)",
  rejected: "ปิดแล้ว (ไม่ทำ)",
};

export const KN_GAP_STATUS_TONE: Record<string, Tone> = {
  open: "danger",
  triaged: "warning",
  in_progress: "info",
  resolved: "success",
  rejected: "neutral",
};

export const KN_GAP_PRIORITY_LABELS: Record<string, string> = {
  low: "ต่ำ",
  medium: "กลาง",
  high: "สูง",
  critical: "วิกฤต",
};

export const KN_GAP_PRIORITY_TONE: Record<string, Tone> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const KN_REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: "รอเริ่ม",
  in_progress: "กำลังทบทวน",
  approved: "ผ่านการทบทวน",
  needs_revision: "ต้องแก้ไข",
  rejected: "ไม่ผ่าน",
};

export const KN_REVIEW_STATUS_TONE: Record<string, Tone> = {
  pending: "info",
  in_progress: "warning",
  approved: "success",
  needs_revision: "warning",
  rejected: "danger",
};

export const KN_REVIEW_TRIGGER_LABELS: Record<string, string> = {
  scheduled: "ตามรอบ",
  incident: "มีเหตุการณ์",
  major_revision: "เครื่อง/วิธีการเปลี่ยนมาก",
  user_report: "ผู้ใช้แจ้งว่าไม่ชัดเจน",
  manual: "สั่งเอง",
};

export const KN_ENTITY_TYPE_LABELS: Record<string, string> = {
  asset: "เครื่องจักร",
  asset_class: "ประเภทเครื่องจักร",
  component: "อะไหล่/ชิ้นส่วนประกอบ",
  failure_mode: "รูปแบบการเสียหาย",
  failure_cause: "สาเหตุการเสียหาย",
  spare_part: "อะไหล่สำรอง",
  work_order: "ใบงานซ่อม",
  pm: "แผนบำรุงรักษา",
  rca: "รายงาน RCA",
  engineering_change: "Engineering Change",
  department: "แผนก",
};

export const KN_RELATION_LINK_LABELS: Record<string, string> = {
  applies_to: "ใช้กับ",
  troubleshoots: "แก้ปัญหา",
  caused_by: "เกิดจาก",
  resolved_by: "แก้ด้วย",
  prevents: "ป้องกัน",
  evidenced_by: "มีหลักฐานจาก",
  reference: "อ้างอิง",
};

export const KN_DOC_LINK_LABELS: Record<string, string> = {
  implements: "ดำเนินการตามเอกสาร",
  governs: "เอกสารกำกับดูแล",
  summarises: "สรุปจากเอกสาร",
  evidenced_by: "มีหลักฐานจากเอกสาร",
  supersedes: "แทนที่เอกสาร",
  reference: "อ้างอิง",
};

export const KN_DEVICE_LABELS: Record<string, string> = {
  mobile: "มือถือ",
  tablet: "แท็บเล็ต",
  desktop: "คอมพิวเตอร์",
  unknown: "ไม่ระบุ",
};

/** ขั้นตอนถัดไปตามสถานะปัจจุบัน — ใช้กับปุ่มบนหน้า detail */
export const KN_FLOW: Record<string, string[]> = {
  draft: ["in_review"],
  in_review: ["approved", "draft"],
  approved: ["published", "draft"],
  published: ["superseded", "archived"],
  superseded: ["archived"],
  archived: [],
};

export function knStatusLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_STATUS_LABELS[s] || s;
}

export function knConfidentialityLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_CONFIDENTIALITY_LABELS[s] || s;
}

export function knHelpfulnessLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_HELPFULNESS_LABELS[s] || s;
}

export function knGapStatusLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_GAP_STATUS_LABELS[s] || s;
}

export function knGapPriorityLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_GAP_PRIORITY_LABELS[s] || s;
}

export function knReviewStatusLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_REVIEW_STATUS_LABELS[s] || s;
}

export function knEntityTypeLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_ENTITY_TYPE_LABELS[s] || s;
}

export function knRelationLinkLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_RELATION_LINK_LABELS[s] || s;
}

export function knDocLinkLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_DOC_LINK_LABELS[s] || s;
}

export function knUsageActionLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_USAGE_ACTION_LABELS[s] || s;
}

export function knDeviceLabel(s: string | null | undefined, fallback = "-"): string {
  if (!s) return fallback;
  return KN_DEVICE_LABELS[s] || s;
}

export function canEditKnArticle(status: string | null | undefined): boolean {
  return status === "draft" || status === "in_review" || status === "approved";
}

export function canSubmitKnArticle(status: string | null | undefined): boolean {
  return status === "draft";
}

export function canApproveKnArticle(status: string | null | undefined): boolean {
  return status === "in_review";
}

export function canPublishKnArticle(status: string | null | undefined): boolean {
  return status === "approved";
}

/* ── formatters ──────────────────────────────────────────────────────────── */

export function fmtKnDate(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "2-digit", day: "2-digit" });
}

export function fmtKnDateTime(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function knDaysUntil(v: string | null | undefined): number | null {
  if (!v) return null;
  const target = new Date(v.length <= 10 ? `${v}T00:00:00` : v);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** อุปกรณ์ที่กำลังใช้งาน — รายงานตามจริง ไม่เดา */
export function currentDevice(): string {
  if (typeof window === "undefined") return "unknown";
  const ua = navigator.userAgent || "";
  if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) return "tablet";
  if (/iPhone|Android.*Mobile|iPod/i.test(ua)) return "mobile";
  return "desktop";
}