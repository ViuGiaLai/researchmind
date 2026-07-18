import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, type Paper, type ResearchProject, type ResearchProjectDetail } from "../../lib/api";
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
  IconWithText,
} from "../Icons";
import { PdfViewer } from "../pdf/PdfViewer";
import { useToast } from "../shared/Toast";

interface ProjectWorkspaceViewProps {
  onStartChat: (paperIds: string[], query?: string) => void;
  onStartReview: (paperIds: string[]) => void;
}

export const ProjectWorkspaceView: React.FC<ProjectWorkspaceViewProps> = ({ onStartChat, onStartReview }) => {
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
    setProject(detail);
    setQuestion(detail.research_question);
  }, []);

  useEffect(() => {
    void Promise.all([loadProjects(), api.listPapers(1, 500).then((result) => setLibrary(result.papers))])
      .catch((error) => toast.addToast("error", error instanceof Error ? error.message : t("projects.load_error")))
      .finally(() => setLoading(false));
  }, [loadProjects, t, toast]);

  useEffect(() => {
    void loadProject(activeId).catch((error) => toast.addToast("error", error instanceof Error ? error.message : t("projects.load_error")));
  }, [activeId, loadProject, t, toast]);

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
                <button type="button" className="rm-btn rm-btn-secondary" disabled={!project.papers.length} onClick={() => onStartReview(project.papers.map((paper) => paper.id))}>
                  <IconWithText icon={IconBookOpen} size={14}>{t("projects.start_review")}</IconWithText>
                </button>
                <button type="button" className="rm-btn rm-btn-primary" disabled={!project.papers.length} onClick={() => onStartChat(project.papers.map((paper) => paper.id), project.research_question)}>
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
                    {availablePapers.map((paper) => <option key={paper.id} value={paper.id}>{paper.title || paper.filename}</option>)}
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
          </>
        )}
      </main>
    </div>
  );
};
