import React, { useEffect, useState, useCallback } from "react";
import type { TeamMember, Workspace, Invitation, TeamActivity } from "@researchmind/types";
import {
  getTeamOverview,
  inviteMember,
  updateMemberRole,
  removeMember as removeMemberApi,
  listInvitations,
  cancelInvitation as cancelInvitationApi,
  resendInvitation as resendInvitationApi,
  listTeamActivity,
} from "@/services/team";
import { listWorkspaces } from "@/services/workspace";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Modal,
} from "@researchmind/ui";
import { Loading } from "@/components/common/Loading";
import {
  Users,
  UserPlus,
  UserX,
  Mail,
  Clock,
  XCircle,
  Activity,
  Shield,
  Key,
  Globe,
  Send,
  Eye,
  CheckCheck,
  TimerOff,
  Ban,
  Monitor,
  Network,
  RefreshCw,
} from "lucide-react";
import { t, tpl } from "@/i18n";
import { formatRelativeTime } from "@researchmind/utils";
import { useLocale } from "@/hooks/useLocale";

type Section = "overview" | "members" | "invite" | "permissions" | "invitations" | "activity" | "audit";

const sections: { id: Section; icon: React.ReactNode; labelKey: string }[] = [
  { id: "overview", icon: <Globe className="h-4 w-4" />, labelKey: "team.sections.overview" },
  { id: "members", icon: <Users className="h-4 w-4" />, labelKey: "team.sections.members" },
  { id: "invite", icon: <UserPlus className="h-4 w-4" />, labelKey: "team.sections.invite" },
  { id: "permissions", icon: <Shield className="h-4 w-4" />, labelKey: "team.sections.permissions" },
  { id: "invitations", icon: <Mail className="h-4 w-4" />, labelKey: "team.sections.invitations" },
  { id: "activity", icon: <Activity className="h-4 w-4" />, labelKey: "team.sections.activity" },
  { id: "audit", icon: <Key className="h-4 w-4" />, labelKey: "team.sections.audit" },
];

const ROLES = ["owner", "admin", "editor", "commenter", "viewer"] as const;
const INVITE_ROLES = ["admin", "editor", "commenter", "viewer"] as const;

const INVITATION_STYLES: Record<string, string> = {
  sent: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  opened: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  accepted: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  expired: "border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-400",
  revoked: "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  cancelled: "border-slate-400/30 bg-slate-400/10 text-slate-500 dark:text-slate-500",
};

const INVITATION_ICONS: Record<string, React.ReactNode> = {
  sent: <Send className="h-4 w-4" />,
  opened: <Eye className="h-4 w-4" />,
  accepted: <CheckCheck className="h-4 w-4" />,
  expired: <TimerOff className="h-4 w-4" />,
  revoked: <Ban className="h-4 w-4" />,
  cancelled: <XCircle className="h-4 w-4" />,
};

function roleBadgeVariant(role: string): "default" | "info" | "purple" {
  switch (role) {
    case "owner": return "default";
    case "admin": return "info";
    case "editor": return "purple";
    case "commenter": return "info";
    case "viewer": return "default";
    default: return "default";
  }
}

export default function TeamPage() {
  const [activeSection, setActiveSection] = useState<Section>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Data
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activities, setActivities] = useState<TeamActivity[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [sharedWorkspaces, setSharedWorkspaces] = useState(0);
  const [pendingInvites, setPendingInvites] = useState(0);

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamMember["role"]>("editor");
  const [inviteWsId, setInviteWsId] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMsg, setInviteMsg] = useState("");

  // Role change
  const [changingRole, setChangingRole] = useState<string | null>(null);

  // Remove confirm
  const [removeTarget, setRemoveTarget] = useState<TeamMember | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeWsId, setRemoveWsId] = useState("");
  const [transferOwnership, setTransferOwnership] = useState(false);
  const [newOwnerId, setNewOwnerId] = useState("");
  const [keepComments, setKeepComments] = useState(true);

  const locale = useLocale();

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewRes, wsRes] = await Promise.all([
        getTeamOverview().catch(() => ({
          overview: { teamName: "Research Team", totalMembers: 0, sharedWorkspaces: 0, pendingInvitations: 0, activeToday: 0, totalComments: 0, totalReports: 0, totalSnapshots: 0 },
          members: [],
          workspaces: [],
        })),
        listWorkspaces().catch(() => ({ data: [], total: 0 })),
      ]);

      setTotalMembers(overviewRes.overview.totalMembers);
      setSharedWorkspaces(overviewRes.overview.sharedWorkspaces);
      setPendingInvites(overviewRes.overview.pendingInvitations);
      setMembers(overviewRes.members);
      setWorkspaces(wsRes.data);

      Promise.all([
        listInvitations().then(setInvitations).catch(() => {}),
        listTeamActivity().then(setActivities).catch(() => {}),
      ]);

      if (!inviteWsId && wsRes.data.length > 0) {
        setInviteWsId(wsRes.data[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load team");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleInvite() {
    if (!inviteWsId || !inviteEmail.trim()) return;
    setInviteBusy(true);
    setInviteMsg("");
    setError("");
    try {
      await inviteMember(inviteWsId, inviteEmail.trim(), inviteRole, inviteMessage.trim() || undefined);
      const ws = workspaces.find((w) => w.id === inviteWsId);
      setInviteMsg(tpl("team.invite.success", {
        email: inviteEmail.trim(),
        role: t(`team.roles.${inviteRole}`),
        workspace: ws?.name || "",
      }));
      setInviteEmail("");
      setInviteMessage("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invite failed");
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: TeamMember["role"]) {
    setChangingRole(memberId);
    setError("");
    try {
      await updateMemberRole(memberId, newRole);
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update role");
    } finally {
      setChangingRole(null);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setRemoveBusy(true);
    setError("");
    try {
      await removeMemberApi(removeTarget.id, {
        workspaceId: removeWsId || removeTarget.workspaceId,
        transferOwnership,
        newOwnerId: transferOwnership ? newOwnerId : undefined,
        keepComments,
      });
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget.id));
      setRemoveTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove member");
    } finally {
      setRemoveBusy(false);
    }
  }

  async function handleCancelInvitation(invId: string) {
    try {
      await cancelInvitationApi(invId);
      setInvitations((prev) => prev.filter((i) => i.id !== invId));
      setPendingInvites((p) => Math.max(0, p - 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel invitation");
    }
  }

  async function handleResendInvitation(invId: string) {
    try {
      await resendInvitationApi(invId);
      setInvitations((prev) =>
        prev.map((i) => (i.id === invId ? { ...i, status: "sent" as const, expireAt: new Date(Date.now() + 7 * 86400000).toISOString() } : i)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to resend invitation");
    }
  }

  if (loading) return <Loading label={t("common.loading")} />;

  const noData = members.length === 0 && workspaces.length === 0;

  if (noData) {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-foreground">{t("team.title")}</h2>
          <p className="mt-1 text-muted-foreground">{t("team.subtitle")}</p>
        </div>
        {error && <ErrorBanner error={error} onClose={() => setError("")} />}
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <Users className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">{t("team.empty.title")}</h3>
            <p className="max-w-md text-sm text-muted-foreground">{t("team.empty.description")}</p>
            <div className="space-y-1 text-left text-sm text-muted-foreground">
              <p className="font-medium text-foreground">{t("team.empty.permissions")}</p>
              <p>{t("team.empty.permViewer")}</p>
              <p>{t("team.empty.permCommenter")}</p>
              <p>{t("team.empty.permEditor")}</p>
              <p>{t("team.empty.permAdmin")}</p>
            </div>
            <Button onClick={() => { setInviteWsId(""); setActiveSection("invite"); }}>
              <UserPlus className="mr-2 h-4 w-4" />{t("team.inviteMember")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sectionTabs = sections.map((s) => (
    <button key={s.id} onClick={() => setActiveSection(s.id)}
      className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all ${
        activeSection === s.id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >{s.icon}{t(s.labelKey)}</button>
  ));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{t("team.title")}</h2>
        <p className="mt-1 text-muted-foreground">{t("team.subtitle")}</p>
      </div>
      {error && <ErrorBanner error={error} onClose={() => setError("")} />}
      {inviteMsg && <SuccessBanner message={inviteMsg} />}
      <div className="flex flex-wrap gap-2">{sectionTabs}</div>

      {/* ── Overview ─────────────────────────────────────────── */}
      {activeSection === "overview" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard icon={<Users className="h-8 w-8 text-primary" />} value={totalMembers} label={t("team.overview.totalMembers")} />
          <SummaryCard icon={<Globe className="h-8 w-8 text-primary" />} value={sharedWorkspaces} label={t("team.overview.sharedWorkspaces")} />
          <SummaryCard icon={<Mail className="h-8 w-8 text-amber-500" />} value={pendingInvites} label={t("team.overview.pendingInvites")} />
          <SummaryCard icon={<Shield className="h-8 w-8 text-emerald-500" />} value={workspaces.length} label={t("team.overview.organization")} />
        </div>
      )}

      {/* ── Members ──────────────────────────────────────────── */}
      {activeSection === "members" && (
        <div className="space-y-3">
          {members.length === 0 ? (
            <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("team.empty.title")}</CardContent>
            </Card>
          ) : members.map((m) => (
            <MemberCard
              key={m.id}
              member={m}
              workspaces={workspaces}
              changingRole={changingRole}
              onRoleChange={handleRoleChange}
              onRemove={setRemoveTarget}
              locale={locale}
            />
          ))}
        </div>
      )}

      {/* ── Invite ──────────────────────────────────────────── */}
      {activeSection === "invite" && (
        <InviteForm
          workspaces={workspaces}
          inviteWsId={inviteWsId}
          inviteEmail={inviteEmail}
          inviteRole={inviteRole}
          inviteMessage={inviteMessage}
          inviteBusy={inviteBusy}
          onWorkspaceChange={setInviteWsId}
          onEmailChange={setInviteEmail}
          onRoleChange={setInviteRole}
          onMessageChange={setInviteMessage}
          onSubmit={handleInvite}
        />
      )}

      {/* ── Permissions ─────────────────────────────────────── */}
      {activeSection === "permissions" && (
        <PermissionsSection members={members} workspaces={workspaces} />
      )}

      {/* ── Invitations ─────────────────────────────────────── */}
      {activeSection === "invitations" && (
        <div className="space-y-3">
          {invitations.length === 0 ? (
            <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("team.invitations.none")}</CardContent>
            </Card>
          ) : invitations.map((inv) => (
            <InvitationCard
              key={inv.id}
              invitation={inv}
              locale={locale}
              onCancel={handleCancelInvitation}
              onResend={handleResendInvitation}
            />
          ))}
        </div>
      )}

      {/* ── Activity ────────────────────────────────────────── */}
      {activeSection === "activity" && (
        <ActivitySection activities={activities} locale={locale} />
      )}

      {/* ── Audit ───────────────────────────────────────────── */}
      {activeSection === "audit" && (
        <AuditSection activities={activities} locale={locale} />
      )}

      {/* ── Remove Modal ────────────────────────────────────── */}
      {removeTarget && (
        <RemoveModal
          member={removeTarget}
          workspaces={workspaces}
          removeWsId={removeWsId}
          transferOwnership={transferOwnership}
          newOwnerId={newOwnerId}
          keepComments={keepComments}
          busy={removeBusy}
          members={members}
          onWsChange={setRemoveWsId}
          onTransferChange={setTransferOwnership}
          onNewOwnerChange={setNewOwnerId}
          onKeepCommentsChange={setKeepComments}
          onConfirm={handleRemove}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function ErrorBanner({ error, onClose }: { error: string; onClose: () => void }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error}
      <button onClick={onClose} className="ml-2 underline">{t("common.close")}</button>
    </div>
  );
}

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
      {message}
    </div>
  );
}

function SummaryCard({ icon, value, label }: { icon: React.ReactNode; value: number | string; label: string }) {
  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
        {icon}
        <span className="text-3xl font-bold text-foreground">{value}</span>
        <span className="text-sm text-muted-foreground">{label}</span>
      </CardContent>
    </Card>
  );
}

function MemberCard({
  member, workspaces, changingRole, onRoleChange, onRemove, locale,
}: {
  member: TeamMember; workspaces: Workspace[]; changingRole: string | null;
  onRoleChange: (id: string, role: TeamMember["role"]) => void;
  onRemove: (m: TeamMember) => void; locale: string;
}) {
  // Build per-workspace role options from member.workspaces
  const wsRoles = member.workspaces && member.workspaces.length > 0
    ? member.workspaces
    : [{ id: member.workspaceId, name: workspaces.find(w => w.id === member.workspaceId)?.name || "Default", role: member.role }];

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm transition-all hover:border-border">
      <CardContent className="flex flex-wrap items-center gap-4 py-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{member.name}</span>
            <span className={`h-2 w-2 rounded-full ${member.online ? "bg-emerald-500" : "bg-slate-400"}`} />
            <span className="text-xs text-muted-foreground">
              {member.online ? t("team.statuses.online") : t("team.statuses.offline")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{member.email}</div>
          {member.lastSeenAt && <div className="text-xs text-muted-foreground/70">{formatRelativeTime(member.lastSeenAt, locale)}</div>}
        </div>

        {/* Per-workspace badges */}
        <div className="hidden sm:flex sm:flex-wrap sm:gap-1">
          {wsRoles.slice(0, 3).map((w) => (
            <Badge key={w.id} tone="default" className="text-xs border-slate-700 bg-slate-800/50">{w.name}</Badge>
          ))}
          {wsRoles.length > 3 && <Badge tone="default" className="text-xs border-slate-700 bg-slate-800/50">+{wsRoles.length - 3}</Badge>}
        </div>

        {/* Role selector — per workspace */}
        <div className="flex items-center gap-2">
          {member.role === "owner" ? (
            <Badge>{t("team.roles.owner")}</Badge>
          ) : (
            <select
              value={member.role}
              disabled={changingRole === member.id}
              onChange={(e) => onRoleChange(member.id, e.target.value as TeamMember["role"])}
              className="h-8 rounded-lg border border-border bg-background px-2 text-xs text-foreground"
            >
              {ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>{t(`team.roles.${r}`)}</option>
              ))}
            </select>
          )}
          {member.role !== "owner" && (
            <button onClick={() => onRemove(member)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title={t("common.delete")}>
              <UserX className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function InviteForm({
  workspaces, inviteWsId, inviteEmail, inviteRole, inviteMessage, inviteBusy,
  onWorkspaceChange, onEmailChange, onRoleChange, onMessageChange, onSubmit,
}: {
  workspaces: Workspace[]; inviteWsId: string; inviteEmail: string;
  inviteRole: TeamMember["role"]; inviteMessage: string; inviteBusy: boolean;
  onWorkspaceChange: (v: string) => void; onEmailChange: (v: string) => void;
  onRoleChange: (v: TeamMember["role"]) => void; onMessageChange: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardContent className="space-y-4 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <UserPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">{t("team.inviteMember")}</h3>
            <p className="text-xs text-muted-foreground">{t("team.subtitle")}</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t("team.invite.email")}</label>
            <input type="email" value={inviteEmail} onChange={(e) => onEmailChange(e.target.value)}
              placeholder={t("team.invite.emailPlaceholder")}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground/50" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t("team.invite.role")}</label>
            <select value={inviteRole} onChange={(e) => onRoleChange(e.target.value as TeamMember["role"])}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground">
              {INVITE_ROLES.map((r) => (<option key={r} value={r}>{t(`team.roles.${r}`)}</option>))}
            </select>
            <p className="text-xs text-muted-foreground">{t(`team.roleDescriptions.${inviteRole}`)}</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">{t("team.invite.workspace")}</label>
            {workspaces.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("team.invite.noWorkspace")}</p>
            ) : (
              <select value={inviteWsId} onChange={(e) => onWorkspaceChange(e.target.value)}
                className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground">
                {workspaces.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
              </select>
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-sm font-medium text-foreground">{t("team.invite.message")}</label>
            <textarea value={inviteMessage} onChange={(e) => onMessageChange(e.target.value)}
              placeholder={t("team.invite.messagePlaceholder")} rows={3}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50" />
          </div>
        </div>
        <div className="flex justify-end">
          <Button loading={inviteBusy} disabled={!inviteWsId || !inviteEmail.trim()} onClick={onSubmit}>
            <Mail className="mr-2 h-4 w-4" />{t("team.invite.send")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function PermissionsSection({ members, workspaces }: { members: TeamMember[]; workspaces: Workspace[] }) {
  return (
    <div className="space-y-4">
      {workspaces.length === 0 ? (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("team.invite.noWorkspace")}</CardContent>
        </Card>
      ) : workspaces.map((ws) => {
        const wsMembers = members.filter((m) => m.workspaces?.some((w) => w.id === ws.id));
        if (wsMembers.length === 0) return null;
        return (
          <Card key={ws.id} className="border-border/40 bg-card/50 backdrop-blur-sm">
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">{ws.name}</h4>
                <Badge tone="default" className="text-xs border-slate-700 bg-slate-800/50">{wsMembers.length} {t("team.columns.member").toLowerCase()}</Badge>
              </div>
              <div className="divide-y divide-border/50">
                {wsMembers.map((m) => (
                  <div key={m.id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {m.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-foreground">{m.name}</span>
                    </div>
                    <Badge tone={roleBadgeVariant(m.role)} className="text-xs">{t(`team.roles.${m.role}`)}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function InvitationCard({ invitation, locale, onCancel, onResend }: {
  invitation: Invitation; locale: string;
  onCancel: (id: string) => void; onResend: (id: string) => void;
}) {
  const statusStyle = INVITATION_STYLES[invitation.status] || INVITATION_STYLES.sent;
  const statusIcon = INVITATION_ICONS[invitation.status] || INVITATION_ICONS.sent;
  const isActive = invitation.status === "sent" || invitation.status === "opened";

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium text-foreground">{invitation.email}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge tone="default" className="text-xs border-slate-700 bg-slate-800/50">{t(`team.roles.${invitation.role}`)}</Badge>
              <span>→ {invitation.workspaceName}</span>
              <span>· {formatRelativeTime(invitation.createdAt, locale)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Status badge */}
          <div className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${statusStyle}`}>
            {statusIcon}
            {t(`team.invitationStatuses.${invitation.status}`)}
          </div>
          {/* Actions */}
          {isActive && (
            <>
              <button onClick={() => onResend(invitation.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                title={t("team.invitations.resend")}>
                <RefreshCw className="h-4 w-4" />
              </button>
              <button onClick={() => onCancel(invitation.id)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title={t("team.invitations.cancel")}>
                <XCircle className="h-4 w-4" />
              </button>
            </>
          )}
          {invitation.expireAt && (
            <span className="text-xs text-muted-foreground/60">
              {new Date(invitation.expireAt) < new Date() ? t("team.invitationStatuses.expired") : formatRelativeTime(invitation.expireAt, locale)}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ActivitySection({ activities, locale }: { activities: TeamActivity[]; locale: string }) {
  return (
    <div className="space-y-3">
      {activities.length === 0 ? (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("team.activity.none")}</CardContent>
        </Card>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2.5 top-2 h-[calc(100%-16px)] w-px bg-border" />
          {activities.map((act) => (
            <div key={act.id} className="relative pb-5 last:pb-0">
              <div className="absolute -left-4 mt-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
              <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
                <CardContent className="flex items-center gap-3 py-3">
                  <Activity className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-foreground">{act.title}</div>
                    <div className="text-xs text-muted-foreground">{act.detail}</div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(act.timestamp, locale)}</span>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AuditSection({ activities, locale }: { activities: TeamActivity[]; locale: string }) {
  const auditItems = activities.filter(
    (a) => a.type.startsWith("permission") || a.type === "member_removed" || a.type === "workspace_shared" || a.type === "member_invited" || a.type === "invitation_cancelled" || a.type === "invitation_resent"
  );

  return (
    <div className="space-y-3">
      {auditItems.length === 0 ? (
        <Card className="border-border/40 bg-card/50 backdrop-blur-sm">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">{t("team.auditLog.none")}</CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
                <th className="pb-2 pr-4 font-medium">{t("team.auditLog.time")}</th>
                <th className="pb-2 pr-4 font-medium">{t("team.activity.title")}</th>
                <th className="pb-2 pr-4 font-medium">{t("team.auditLog.ip")}</th>
                <th className="pb-2 pr-4 font-medium">{t("team.auditLog.device")}</th>
                <th className="pb-2 font-medium">{t("team.columns.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {auditItems.map((act) => (
                <tr key={act.id} className="hover:bg-accent/30">
                  <td className="py-3 pr-4 whitespace-nowrap text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatRelativeTime(act.timestamp, locale)}
                    </div>
                  </td>
                  <td className="py-3 pr-4">
                    <div className="text-foreground">{act.title}</div>
                    <div className="text-xs text-muted-foreground">{act.detail}</div>
                  </td>
                  <td className="py-3 pr-4">
                    {act.sourceIp ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Network className="h-3.5 w-3.5" />
                        {act.sourceIp}
                      </div>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="py-3 pr-4">
                    {act.deviceInfo ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Monitor className="h-3.5 w-3.5" />
                        {act.deviceInfo}
                      </div>
                    ) : <span className="text-muted-foreground/50">—</span>}
                  </td>
                  <td className="py-3">
                    <Badge tone="default" className="text-xs border-slate-700 bg-slate-800/50">
                      {act.type === "member_removed" ? t("common.delete") :
                       act.type === "permission_updated" ? t("common.edit") :
                       act.type.startsWith("invitation") ? t("team.invitations.cancel") :
                       t("team.workspacePermissions.owner")}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RemoveModal({
  member, workspaces, removeWsId, transferOwnership, newOwnerId, keepComments, busy, members,
  onWsChange, onTransferChange, onNewOwnerChange, onKeepCommentsChange, onConfirm, onClose,
}: {
  member: TeamMember; workspaces: Workspace[]; removeWsId: string;
  transferOwnership: boolean; newOwnerId: string; keepComments: boolean; busy: boolean;
  members: TeamMember[];
  onWsChange: (v: string) => void; onTransferChange: (v: boolean) => void;
  onNewOwnerChange: (v: string) => void; onKeepCommentsChange: (v: boolean) => void;
  onConfirm: () => void; onClose: () => void;
}) {
  const sortedWorkspaces = member.workspaces?.map(w => ({ id: w.id, name: w.name }))
    .sort((a, b) => a.name.localeCompare(b.name)) || [];

  return (
    <Modal open onClose={onClose}>
      <div className="space-y-5 p-6">
        <h3 className="text-lg font-semibold text-foreground">{t("team.removeConfirm.title")}</h3>
        <p className="text-sm text-muted-foreground">
          {tpl("team.removeConfirm.description", { name: member.name, email: member.email })}
        </p>

        {/* Workspace selection */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">{t("team.removeConfirm.workspace")}</label>
          <select value={removeWsId || member.workspaceId} onChange={(e) => onWsChange(e.target.value)}
            className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground">
            {sortedWorkspaces.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>

        {/* Ownership transfer */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={transferOwnership} onChange={(e) => onTransferChange(e.target.checked)}
            className="h-4 w-4 rounded border-border" />
          <span className="text-foreground">{t("team.removeConfirm.transferOwnership")}</span>
        </label>

        {transferOwnership && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{t("team.removeConfirm.newOwner")}</label>
            <select value={newOwnerId} onChange={(e) => onNewOwnerChange(e.target.value)}
              className="h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground">
              <option value="">{t("common.select")}</option>
              {members.filter((m) => m.id !== member.id && m.role !== "owner").map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.email})</option>
              ))}
            </select>
          </div>
        )}

        {/* Keep comments */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepComments} onChange={(e) => onKeepCommentsChange(e.target.checked)}
            className="h-4 w-4 rounded border-border" />
          <span className="text-foreground">{t("team.removeConfirm.keepComments")}</span>
        </label>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>{t("team.removeConfirm.cancel")}</Button>
          <Button loading={busy} variant="danger" onClick={onConfirm}>
            <UserX className="mr-2 h-4 w-4" />{t("team.removeConfirm.confirm")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
