// Generated from the applied SQL schema by npm run db:types. Do not edit.
// Optional pgvector table is verified by the Neon integration test.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];
export interface DatabaseRows {
  ai_usage: {
    owner_id: string;
    day: string;
    requests: number;
  };
  aliases: {
    id: string;
    owner_id: string;
    space_id: string;
    entity_id: string;
    name: string;
    verified: boolean;
  };
  attachments: {
    id: string;
    owner_id: string;
    space_id: string;
    capture_id: string;
    storage_key: string;
    name: string;
    mime: string;
    size: number;
    sha256: string;
    state: string;
  };
  captures: {
    id: string;
    owner_id: string;
    space_id: string;
    current_revision: number;
    captured_at: string;
    received_at: string;
    timezone: string;
    occurred_on: string | null;
    no_ai: boolean;
    deleted_at: string | null;
    processing_status: string;
    original_payload_hash: string;
  };
  changes: {
    owner_id: string;
    cursor: number;
    capture_id: string;
    operation: string;
    space_id: string;
    no_ai: boolean;
    version: number;
  };
  claims: {
    id: string;
    owner_id: string;
    space_id: string;
    capture_id: string;
    evidence_id: string;
    description: string;
    kind: string;
    review_status: string;
    supersedes: string | null;
  };
  commitment_history: {
    id: string;
    owner_id: string;
    commitment_id: string;
    status: string;
    created_at: string;
  };
  commitments: {
    id: string;
    owner_id: string;
    space_id: string;
    capture_id: string;
    description: string;
    direction: string;
    due_on: string | null;
    status: string;
    evidence_id: string | null;
  };
  deliveries: {
    id: string;
    owner_id: string;
    reminder_id: string;
    schedule_revision: number;
    subscription_id: string;
    status: string;
    attempts: number;
    lease_until: string | null;
    fence: string | null;
    accepted_at: string | null;
    error_code: string | null;
  };
  entities: {
    id: string;
    owner_id: string;
    space_id: string;
    name: string;
    kind: string;
    status: string;
  };
  entity_links: {
    id: string;
    owner_id: string;
    space_id: string;
    entity_id: string;
    capture_id: string;
    role: string | null;
    status: string;
  };
  events: {
    id: string;
    owner_id: string;
    space_id: string;
    capture_id: string;
    title: string;
    state: string;
    occurred_on: string | null;
    precision: string;
    review_status: string;
    evidence_id: string | null;
  };
  evidence: {
    id: string;
    owner_id: string;
    revision_id: string;
    quote: string;
    start_offset: number;
    end_offset: number;
  };
  imports: {
    owner_id: string;
    archive_id: string;
    created_at: string;
  };
  integration_tokens: {
    id: string;
    owner_id: string;
    hash: string;
    prefix: string;
    spaces: string[];
    scopes: string[];
    expires_at: string;
    revoked_at: string | null;
    last_used_at: string | null;
    rate_window: string;
    rate_count: number;
  };
  invited_owners: {
    email: string;
  };
  jobs: {
    id: string;
    owner_id: string;
    capture_id: string | null;
    revision: number | null;
    kind: string;
    logical_key: string;
    status: string;
    run_at: string;
    attempts: number;
    lease_until: string | null;
    fence: string | null;
    error_code: string | null;
    chunk_start: number;
    chunk_end: number;
  };
  memory_view: {
    id: string | null;
    owner_id: string | null;
    space_id: string | null;
    current_revision: number | null;
    captured_at: string | null;
    received_at: string | null;
    timezone: string | null;
    occurred_on: string | null;
    no_ai: boolean | null;
    deleted_at: string | null;
    processing_status: string | null;
    text: string | null;
  };
  occasions: {
    id: string;
    owner_id: string;
    space_id: string;
    name: string;
    month: number;
    day: number;
    birth_year: number | null;
    leap_policy: string;
    auto_prepare: boolean;
    preparation_days: string[];
  };
  profiles: {
    owner_id: string;
    display_name: string;
    timezone: string;
    ai_consent: boolean;
    no_ai_default: boolean;
    default_space_id: string | null;
    change_cursor: number;
    reminder_defaults_approved: boolean;
    reminder_time: string;
    quiet_start: string;
    quiet_end: string;
  };
  purge_audit: {
    id: string;
    owner_id: string;
    purged_at: string;
  };
  push_subscriptions: {
    id: string;
    owner_id: string;
    subscription: Json;
    disabled: boolean;
  };
  reminders: {
    id: string;
    owner_id: string;
    capture_id: string;
    title: string;
    run_at: string;
    timezone: string;
    status: string;
    schedule_revision: number;
    commitment_id: string | null;
  };
  revisions: {
    id: string;
    owner_id: string;
    capture_id: string;
    number: number;
    text: string;
    content_hash: string;
    origin: string;
    created_at: string;
  };
  search_chunks: {
    id: string;
    owner_id: string;
    revision_id: string;
    chunk_offset: number;
    text: string;
    model: string | null;
    dimensions: number | null;
    embedding: string[] | null;
  };
  spaces: {
    id: string;
    owner_id: string;
    name: string;
  };
  summaries: {
    id: string;
    owner_id: string;
    space_id: string;
    text: string;
    source_fingerprint: string;
    stale: boolean;
    created_at: string;
  };
  worker_health: {
    id: boolean;
    last_run: string | null;
  };
}
