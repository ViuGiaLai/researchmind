export type PrivacyLevel =
  | "local_only"
  | "sync_metadata"
  | "backup_encrypted"
  | "publish_report"
  | "team";

export type SyncState =
  | "Synced"
  | "Syncing"
  | "Local Only"
  | "Conflict"
  | "Backup Available"
  | "Archived";

export type ReportType = "Live Report" | "Snapshot";
export type Visibility = "public" | "unlisted" | "private";
export type PlanTier = "free" | "pro" | "lab" | "enterprise";
export type MemberRole = "owner" | "admin" | "editor" | "reviewer" | "viewer";
export type DevicePlatform = "desktop" | "web" | "mobile";
export type BackupStatus = "completed" | "pending" | "failed" | "restoring";
export type BackupType = "workspace" | "settings" | "prompts" | "full";
export type NotificationKind =
  | "info"
  | "success"
  | "warning"
  | "error"
  | "invite"
  | "billing"
  | "sync";

export type SnapshotType = "auto" | "manual";
export type SnapshotTag = "draft" | "milestone" | "published" | "archived";

export type ActivityCategory = "research" | "ai" | "reports" | "cloud" | "team" | "security";

export type EventType =
  // ── Research ──
  | "paper.imported"
  | "paper.deleted"
  | "paper.annotation"
  | "paper.starred"
  | "paper.metadata_updated"
  // ── AI ──
  | "ai.report_generated"
  | "ai.evidence_matrix"
  | "ai.knowledge_graph"
  | "ai.research_memory"
  | "ai.chat_completed"
  // ── Reports ──
  | "report.published"
  | "report.unpublished"
  | "report.updated"
  | "report.downloaded"
  | "report.exported"
  // ── Snapshots ──
  | "snapshot.created"
  | "snapshot.restored"
  | "snapshot.compared"
  // ── Cloud / Sync ──
  | "cloud.synced"
  | "cloud.sync_conflict"
  | "cloud.backup_created"
  | "cloud.backup_restored"
  | "cloud.device_linked"
  | "cloud.device_disconnected"
  // ── Team / Collaboration ──
  | "team.member_invited"
  | "team.member_joined"
  | "team.member_left"
  | "team.comment_added"
  | "team.permission_changed"
  | "team.workspace_shared"
  // ── Settings / Account ──
  | "settings.changed"
  | "security.login"
  | "security.logout"
  | "security.password_changed"
  | "api_key.created"
  | "api_key.deleted";

export type ActivityType = EventType;

/** Derive category from the event type prefix. */
export function eventCategory(et: string): ActivityCategory {
  const prefix = et.split(".")[0];
  switch (prefix) {
    case "paper": return "research";
    case "ai": return "ai";
    case "report": return "reports";
    case "snapshot": return "reports";
    case "cloud": return "cloud";
    case "team": return "team";
    case "security":
    case "settings":
    case "api_key": return "security";
    default: return "cloud";
  }
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  plan: PlanTier;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerUid: string;
  syncState: SyncState;
  privacyLevel: PrivacyLevel;
  paperCount: number;
  reportCount: number;
  memberCount: number;
  storageBytes: number;
  lastBackupAt?: string;
  encrypted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Report {
  id: string;
  workspaceId: string;
  workspaceName?: string;
  title: string;
  type: ReportType;
  url: string;
  visibility: Visibility;
  version: number;
  summary?: string;
  tags?: string[];
  authors?: string[];
  wordCount?: number;
  citationCount?: number;
  aiModel?: string;
  device?: string;
  publishedBy?: string;
  doi?: string;
  contentHtml?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Snapshot {
  id: string;
  reportId: string;
  workspaceId: string;
  workspaceName?: string;
  title: string;
  version: number;
  snapshotType: SnapshotType;
  tag?: SnapshotTag;
  creator: string;
  device?: string;
  hash?: string;
  url: string;
  note?: string;
  summary?: string;
  changes?: string[];
  createdAt: string;
}

export interface ActivityItem {
  id: string;
  /** Namespaced event type, e.g. "report.published". Maps to the ActivityType union. */
  eventType: EventType;
  /** Legacy flat type (backward compat). Derived from eventType's last segment. */
  type: string;
  /** Category auto-derived from eventType prefix. */
  category: ActivityCategory;
  title: string;
  detail: string;
  workspaceId?: string;
  workspaceName?: string;
  actorId?: string;
  actorName?: string;
  /** Structured JSON payload carrying event-specific data. */
  payload?: Record<string, unknown>;
  /** Legacy metadata (backward compat). */
  metadata?: Record<string, string | number>;
  timestamp: string;
}

export interface BackupRecord {
  id: string;
  workspaceId: string;
  type: BackupType;
  name: string;
  sizeBytes: number;
  createdAt: string;
  status: BackupStatus;
}

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  read: boolean;
  href?: string;
  createdAt: string;
}

export type SyncStatus = "synced" | "syncing" | "pending" | "conflict" | "offline" | "error";

export interface Device {
  id: string;
  name: string;
  platform: DevicePlatform;
  os?: string;
  version?: string;
  architecture?: string;
  timezone?: string;
  cpu?: string;
  ram?: string;
  diskRemaining?: string;
  lastSeenAt: string;
  lastSyncAt?: string;
  lastLoginAt?: string;
  createdAt: string;
  current: boolean;
  trusted: boolean;
  online: boolean;
  syncStatus: SyncStatus;
  syncProgress?: number;
  syncHealthPercent?: number;
  lastErrorAt?: string;
  avgSyncTimeMs?: number;
  storageBytes?: number;
  storageMetadataBytes?: number;
  storageReportsBytes?: number;
  storageBackupsBytes?: number;
  workspaceCount: number;
  workspaces?: { id: string; name: string; syncStatus?: SyncStatus }[];
  lastIp?: string;
  pendingSync?: number;
  uploading?: number;
  downloading?: number;
  failedSync?: number;
  lastBackupAt?: string;
  nextBackupAt?: string;
  restorePointCount?: number;
  backupSizeBytes?: number;
  recentActivity?: { type: string; title: string; timestamp: string }[];
}

export interface TeamMember {
  id: string;
  userId: string;
  workspaceId: string;
  name: string;
  email: string;
  role: MemberRole;
  online: boolean;
  lastSeenAt?: string;
  avatarUrl?: string;
  workspaces?: { id: string; name: string; role: MemberRole }[];
  joinedAt: string;
}

export type InvitationStatus = "sent" | "opened" | "accepted" | "expired" | "revoked" | "cancelled";

export interface Invitation {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: MemberRole;
  message?: string;
  status: InvitationStatus;
  inviteToken: string;
  expireAt: string;
  acceptedAt?: string;
  invitedBy: string;
  invitedByName?: string;
  createdAt: string;
}

export interface TeamOverview {
  teamName: string;
  totalMembers: number;
  sharedWorkspaces: number;
  pendingInvitations: number;
  activeToday: number;
  totalComments: number;
  totalReports: number;
  totalSnapshots: number;
}

export interface TeamActivity {
  id: string;
  type: string;
  title: string;
  detail: string;
  actorId: string;
  actorName: string;
  workspaceId?: string;
  sourceIp?: string;
  deviceInfo?: string;
  timestamp: string;
}

export interface RemoveMemberOptions {
  workspaceId: string;
  transferOwnership: boolean;
  newOwnerId?: string;
  keepComments: boolean;
}

export interface TeamOverview {
  teamName: string;
  totalMembers: number;
  sharedWorkspaces: number;
  pendingInvitations: number;
}

export interface TeamActivity {
  id: string;
  type: string;
  title: string;
  detail: string;
  actorId: string;
  actorName: string;
  workspaceId?: string;
  timestamp: string;
}

export interface BillingPlan {
  id: PlanTier;
  name: string;
  priceMonthly: number;
  currency: string;
  features: string[];
  highlighted?: boolean;
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: "paid" | "open" | "void" | "draft";
  periodStart: string;
  periodEnd: string;
  pdfUrl?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  scopes: string[];
}

export interface UserSettings {
  theme: "dark" | "light" | "system";
  locale: "en" | "vi";
  emailNotifications: boolean;
  weeklyDigest: boolean;
  autoBackup: boolean;
  defaultVisibility: Visibility;
}

export interface AiUsage {
  provider: string;
  requests: number;
  tokens?: number;
}

export interface SystemService {
  name: string;
  status: "healthy" | "degraded" | "down";
}

export interface MonthlySummary {
  month: string;
  papersAdded: number;
  reportsCreated: number;
  aiChats: number;
  backups: number;
  snapshots: number;
  graphUpdates: number;
}

export interface ResearchStat {
  label: string;
  value: string | number;
}

export interface AnalyticsSummary {
  workspaces: number;
  reports: number;
  snapshots: number;
  papers: number;
  citations: number;
  aiChats: number;
  notes: number;
  knowledgeGraphs: number;
  storageMb: number;
  backupSizeMb: number;
  lastBackupAt: string | null;
  pendingSync: number;
  failedSync: number;
  lastSyncAt: string | null;
  devices: Device[];
  aiUsage: AiUsage[];
  researchGrowth: { papersPerWeek: number; kgNodes: number; evidenceExtracted: number; contradictionsFound: number; reportsGenerated: number };
  researchStats: ResearchStat[];
  monthlySummary: MonthlySummary | null;
  activityLast7d: number;
  syncHealth: number;
  services: SystemService[];
  lastLogin: string | null;
  apiKeysCount: number;
  sessionCount: number;
}

export interface ApiError {
  error: string;
  code?: string;
  status: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiListResponse<T> {
  data: T[];
  total?: number;
}
