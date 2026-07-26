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

export type ActivityType =
  | "report_published"
  | "paper_imported"
  | "backup_created"
  | "workspace_updated"
  | "device_linked"
  | "member_invited"
  | "settings_changed"
  | "snapshot_created"
  | "login"
  | "api_key_created";

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
  type: ActivityType;
  category: ActivityCategory;
  title: string;
  detail: string;
  workspaceId?: string;
  workspaceName?: string;
  actorId?: string;
  actorName?: string;
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
