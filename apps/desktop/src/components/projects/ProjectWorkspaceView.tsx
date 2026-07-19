import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type LivingReviewSubscription, type Paper, type ResearchArtifact, type ResearchProject, type ResearchProjectDetail, type ReviewAuditEvent, type WorkspaceMember } from "../../lib/api";
import { paperDisplayTitle } from "../../lib/paperDisplay";
import {
  IconArrowRight,
  IconBookOpen,
  IconChat,
  IconCheck,
  IconFileText,
  IconFolder,
  IconPlus,
  IconSpinner,
  IconTrash,
  IconClock,
  IconBookmark,
  IconUser,
  IconRefresh,
  IconWithText,
} from "../Icons";
import { PdfViewer } from "../pdf/PdfViewer";
import { useToast } from "../shared/Toast";

interface ProjectWorkspaceViewProps {
  onStartChat: (paperIds: string[], query: string | undefined, projectId: string) => void;
  onStartReview: (paperIds: string[], projectId: string) => void;
  onProjectChange?: (projectId?: string) => void;
}

export const ProjectWorkspaceView: React.FC<ProjectWorkspaceViewProps> = ({ onStartChat, onStartReview, onProjectChange }) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [activeId, setActiveId] = useState("");
  const [project, setProject] = useState<ResearchProjectDetail | null>(null);
  const [library, setLibrary] = useState<Paper[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [paperToAdd, setPaperToAdd] = useState("");
  const [readingPaperId, setReadingPaperId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [auditEvents, setAuditEvents] = useState<ReviewAuditEvent[]>([]);
  const [artifacts, setArtifacts] = useState<ResearchArtifact[]>([]);
  const [livingReviews, setLivingReviews] = useState<LivingReviewSubscription[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [artifactTitle, setArtifactTitle] = useState("");
  const [monitorQuery, setMonitorQuery] = useState("");
  const [memberIdentity, setMemberIdentity] = useState("");
  const [alertCount, setAlertCount] = useState<Record<string, number>>({});

  const loadProjects = useCallback(async () => {
    const result = await api.listProjects();
    setProjects(result.projects);
    setActiveId((current) => current || result.projects[0]?.id || "");
  }, []);

  const loadProject = useCallback(async (id: string) => {
    if (!id) {
      setProject(null);
      return;
    }
    const detail = await api.getProject(id);
    const [audit, artifactData, livingData, memberData] = await Promise.all([
      api.getProjectAudit(id), api.listProjectArtifacts(id), api.listLivingReviews(id),
      api.listWorkspaceMembers(detail.workspace_id),
    ]);
    setProject(detail);
    setAuditEvents(audit.events);
    setArtifacts(artifactData.artifacts);
    setLivingReviews(livingData.subscriptions);
    setMembers(memberData.members);
    setMonitorQuery(detail.research_question || "");
    setQuestion(detail.research_question);
  }, []);

  useEffect(() => {
    void Promise.all([loadProjects(), api.listPapers(1, 500).then((result) => setLibrary(result.papers))])
      .catch((error) => toast.addToast("error", error instanceof Error ? error.message : t("projects.load_error")))
      .finally(() => setLoading(false));
  }, [loadProjects, t, toast]);

  useEffect(() => {
    void loadProject(activeId).catch((error) => toast.addToast("error", error instanceof Error ? error.message : t("projects.load_error")));
    onProjectChange?.(activeId || undefined);
  }, [activeId, loadProject, onProjectChange, t, toast]);

  const availablePapers = useMemo(() => {
    const assigned = new Set(project?.papers.map((paper) => paper.id) || []);
    return library.filter((paper) => !assigned.has(paper.id));
  }, [library, project?.papers]);

  const createProject = async () => {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const created = await api.createProject(newTitle.trim());
      setNewTitle("");
      await loadProjects();
      setActiveId(created.id);
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("projects.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const saveQuestion = async () => {
    if (!project) return;
    setSaving(true);
    try {
      await api.updateProject(project.id, { research_question: question });
      setProject({ ...project, research_question: question });
      toast.addToast("success", t("projects.question_saved"));
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("projects.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const addPaper = async () => {
    if (!project || !paperToAdd) return;
    setSaving(true);
    try {
      await api.addProjectPapers(project.id, [paperToAdd]);
      setPaperToAdd("");
      await loadProject(project.id);
      await loadProjects();
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("projects.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const deleteProject = async (id: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.deleteProject(id);
      if (activeId === id) {
        setActiveId(projects.find((p) => p.id !== id)?.id || "");
      }
      await loadProjects();
      toast.addToast("success", t("projects.deleted"));
    } catch (error) {
      toast.addToast("error", error instanceof Error ? error.message : t("projects.save_error"));
    } finally {
      setSaving(false);
    }
  };

  const addArtifact = async () => {
    if (!project || !artifactTitle.trim()) return;
    await api.createProjectArtifact(project.id, { artifact_type: "note", title: artifactTitle.trim() });
    setArtifactTitle("");
    await loadProject(project.id);
  };

  const addLivingReview = async () => {
    if (!project || !monitorQuery.trim()) return;
    await api.createLivingReview(project.id, project.title, monitorQuery.trim());
    await loadProject(project.id);
  };

  const checkLivingReview = async (id: string) => {
    const result = await api.checkLivingReview(id);
    setAlertCount((current) => ({ ...current, [id]: result.count }));
  };

  const addMember = async () => {
    if (!project || !memberIdentity.trim()) return;
    await api.addWorkspaceMember(project.workspace_id, memberIdentity.trim(), "reviewer");
    setMemberIdentity("");
    await loadProject(project.id);
  };

  if (loading) {
    return <div className="project-loading" role="status"><IconSpinner size={22} />{t("common.loading")}</div>;
  }

  if (readingPaperId && project) {
    const paper = project.papers.find((item) => item.id === readingPaperId);
    return (
      <div className="project-reader-shell">
        <button type="button" className="project-back" onClick={() => { setReadingPaperId(""); void loadProject(project.id); }}>
          ← {t("projects.back")}
        </button>
        <PdfViewer
          paperId={readingPaperId}
          paperTitle={paper?.title || t("pdf.preview_title")}
          totalPages={paper?.page_count}
          projectId={project.id}
          mode="embedded"
        />
      </div>
    );
  }

  return (
    <div className="project-workspace">
      <aside className="project-rail">
        <div className="project-rail__heading">
          <span>{t("projects.title")}</span>
          <span className="project-count">{projects.length}</span>
        </div>
        <div className="project-create">
          <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void createProject()} placeholder={t("projects.new_placeholder")} />
          <button type="button" onClick={() => void createProject()} disabled={saving || !newTitle.trim()} aria-label={t("projects.create")}><IconPlus size={15} /></button>
        </div>
        <nav aria-label={t("projects.title")}>
          {projects.map((item) => (
            <div key={item.id} className={`project-rail__item${activeId === item.id ? " is-active" : ""}`} onClick={() => setActiveId(item.id)}>
              <IconFolder size={16} />
              <span><strong>{item.title}</strong><small>{t("projects.paper_count", { count: item.paper_count })}</small></span>
              <button type="button" className="project-rail__delete" onClick={(e) => { e.stopPropagation(); void deleteProject(item.id); }} aria-label={t("common.delete")}>
                <IconTrash size={13} />
              </button>
            </div>
          ))}
        </nav>
      </aside>

      <main className="project-canvas">
        {!project ? (
          <div className="project-empty">
            <IconFolder size={30} />
            <h2>{t("projects.empty_title")}</h2>
            <p>{t("projects.empty_description")}</p>
          </div>
        ) : (
          <>
            <header className="project-header">
              <div>
                <span className="project-eyebrow">{t("projects.workspace_label")}</span>
                <h1>{project.title}</h1>
              </div>
              <div className="project-header__actions">
                <button type="button" className="rm-btn rm-btn-secondary" disabled={!project.papers.length} onClick={() => onStartReview(project.papers.map((paper) => paper.id), project.id)}>
                  <IconWithText icon={IconBookOpen} size={14}>{t("projects.start_review")}</IconWithText>
                </button>
                <button type="button" className="rm-btn rm-btn-primary" disabled={!project.papers.length} onClick={() => onStartChat(project.papers.map((paper) => paper.id), project.research_question, project.id)}>
                  <IconWithText icon={IconChat} size={14}>{t("projects.ask_evidence")}</IconWithText>
                </button>
              </div>
            </header>

            <section className="project-question">
              <label htmlFor="project-research-question">{t("projects.research_question")}</label>
              <div>
                <textarea id="project-research-question" rows={2} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("projects.question_placeholder")} />
                <button type="button" className="rm-btn rm-btn-secondary" disabled={saving || question === project.research_question} onClick={() => void saveQuestion()}>
                  <IconCheck size={14} /> {t("common.save")}
                </button>
              </div>
            </section>

            <div className="project-columns">
              <section className="project-section">
                <header><div><span>{t("projects.sources")}</span><strong>{project.papers.length}</strong></div></header>
                <div className="project-add-paper">
                  <select value={paperToAdd} onChange={(event) => setPaperToAdd(event.target.value)}>
                    <option value="">{t("projects.add_from_library")}</option>
                    {availablePapers.map((paper) => <option key={paper.id} value={paper.id}>{paperDisplayTitle(paper.title, paper.filename)}</option>)}
                  </select>
                  <button type="button" onClick={() => void addPaper()} disabled={!paperToAdd || saving}><IconPlus size={14} />{t("projects.add")}</button>
                </div>
                <div className="project-source-list">
                  {project.papers.map((paper) => (
                    <button type="button" key={paper.id} onClick={() => setReadingPaperId(paper.id)}>
                      <IconFileText size={16} />
                      <span><strong>{paper.title}</strong><small>{[paper.year, paper.page_count ? t("projects.pages", { count: paper.page_count }) : ""].filter(Boolean).join(" · ")}</small></span>
                      <IconArrowRight size={14} />
                    </button>
                  ))}
                </div>
              </section>

              <section className="project-section">
                <header><div><span>{t("projects.evidence")}</span><strong>{project.evidence.length}</strong></div></header>
                <div className="project-evidence-list">
                  {project.evidence.length === 0 ? (
                    <div className="project-section-empty"><p>{t("projects.no_evidence")}</p><small>{t("projects.no_evidence_hint")}</small></div>
                  ) : project.evidence.map((item) => (
                    <button type="button" key={item.id} className={`project-evidence project-evidence--${item.color}`} onClick={() => setReadingPaperId(item.paper_id)}>
                      <span>{t("pdf.page_short", { page: item.page_number })}</span>
                      <blockquote>“{item.quote_text || item.note}”</blockquote>
                      {item.note && item.quote_text ? <small>{item.note}</small> : null}
                    </button>
                  ))}
                </div>
              </section>
            </div>
            <div className="project-tools-grid">
              <section className="project-section">
                <header><div><span>{t("projects.artifacts")}</span><strong>{artifacts.length}</strong></div></header>
                <div className="project-inline-create"><input value={artifactTitle} onChange={(event) => setArtifactTitle(event.target.value)} placeholder={t("projects.artifact_placeholder")} /><button type="button" onClick={() => void addArtifact()} disabled={!artifactTitle.trim()}><IconPlus size={14} /></button></div>
                <div className="project-compact-list">{artifacts.slice(0, 6).map((artifact) => <div key={artifact.id}><IconBookmark size={14} /><span><strong>{artifact.title}</strong><small>{t(`projects.artifact_${artifact.artifact_type}`)}</small></span></div>)}</div>
              </section>
              <section className="project-section">
                <header><div><span>{t("projects.living_review")}</span><strong>{livingReviews.length}</strong></div></header>
                <div className="project-inline-create"><input value={monitorQuery} onChange={(event) => setMonitorQuery(event.target.value)} placeholder={t("projects.monitor_placeholder")} /><button type="button" onClick={() => void addLivingReview()} disabled={!monitorQuery.trim()}><IconPlus size={14} /></button></div>
                <div className="project-compact-list">{livingReviews.map((item) => <div key={item.id}><IconRefresh size={14} /><span><strong>{item.name}</strong><small>{alertCount[item.id] != null ? t("projects.monitor_matches", { count: alertCount[item.id] }) : item.query}</small></span><button type="button" onClick={() => void checkLivingReview(item.id)}>{t("projects.check_now")}</button></div>)}</div>
              </section>
              <section className="project-section">
                <header><div><span>{t("projects.collaborators")}</span><strong>{members.length}</strong></div></header>
                <div className="project-inline-create"><input value={memberIdentity} onChange={(event) => setMemberIdentity(event.target.value)} placeholder={t("projects.member_placeholder")} /><button type="button" onClick={() => void addMember()} disabled={!memberIdentity.trim()}><IconPlus size={14} /></button></div>
                <div className="project-compact-list">{members.map((member) => <div key={member.id}><IconUser size={14} /><span><strong>{member.display_name || member.identity}</strong><small>{member.role}</small></span></div>)}</div>
              </section>
            </div>
            <section className="project-section project-audit">
              <header><div><span>{t("projects.audit_title")}</span><strong>{auditEvents.length}</strong></div></header>
              {auditEvents.length === 0 ? (
                <div className="project-section-empty"><p>{t("projects.audit_empty")}</p></div>
              ) : (
                <ol className="project-audit-list">
                  {auditEvents.slice(0, 20).map((event) => (
                    <li key={event.id}>
                      <IconClock size={14} />
                      <span><strong>{t(`projects.audit_${event.event_type}`, { defaultValue: event.event_type })}</strong><small>{event.created_at ? new Date(event.created_at).toLocaleString() : ""}</small></span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
};
