# Decoupling Academic Knowledge from LLM Prompts: Architecture, Implementation, and Evaluation Protocol for ResearchMind

**Authors:** ResearchMind Academic AI Team  
**Target Venue:** To be selected after aligning the research question and contribution with one venue's scope
**Date:** July 22, 2026  
**Document Version:** 1.1.0-PaperDraft  

---

## ABSTRACT

Large Language Models (LLMs) are increasingly applied to scientific writing, manuscript auditing, and peer-review tasks. However, relying on monolithic, prompt-based LLM architectures incurs severe technical debt, high hallucination rates, and non-deterministic compliance failures against publishing guidelines. In this paper, we introduce **ResearchMind**, a decoupled **Academic AI Platform** that shifts scientific governance, venue formatting rules, and factual verification outside of model prompts. ResearchMind integrates a versioned JSON Rule Engine (covering 12 major academic venues including IEEE, Nature, ACM, Springer LNCS, ICML, and ICLR), a 10-entity Academic Ontology, a 7-tool standalone execution layer, an 8-step multi-agent orchestrator, and a 5-pillar research rigor engine. 

The repository currently contains an eight-item development fixture and deterministic component checks. It does not yet contain end-to-end model outputs, repeated trials, uncertainty estimates, or executable ablations sufficient to support comparative performance claims. Previously reported percentages are retained below only as legacy development targets and must not be cited as empirical findings.

---

## 1. INTRODUCTION

The rapid proliferation of generative AI tools in academic research has created an urgent need for verifiable, deterministic, and venue-compliant scientific tools. Conventional LLM applications embed complex publishing guidelines, citation constraints, and domain taxonomies directly into raw system prompts. This architectural design pattern presents four critical flaws:

1. **Prompt Bloat & Technical Debt:** Guidelines for venues like IEEE Trans, Nature MI, or Springer LNCS require hundreds of strict formatting constraints, overwhelming LLM context windows.
2. **Nondeterministic Hallucinations:** Prompt-driven citation checking frequently invents non-existent DOIs, authors, or publication years.
3. **Lack of Provenance:** Raw LLMs output conclusions without machine-readable trace links to authoritative guideline sources.
4. **Fragile Rule Enforcement:** A change in a conference policy (e.g., page limits or double-blind rules) requires refactoring large prompt text rather than updating versioned data resources.

To address these challenges, we present **ResearchMind**, a decoupled AI platform engineered specifically for scientific writing, auditing, and verification.

---

## 2. SYSTEM ARCHITECTURE & METHODOLOGY

ResearchMind separates static academic knowledge, mechanical formatting rules, and verification tools into distinct architectural layers:

```text
               User Input (Manuscript / Research Query)
                                 │
                 8-Step Agent Pipeline Orchestration
    [Parse → Retrieve → Analyze → Audit → Verify → AutoFix → Synthesize → Export]
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
  Venue Rule Engine       Knowledge Base &         Standalone Tool Layer
(venue_rules.json 12x)    Academic Governance    (7 Decoupled Python Tools)
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 ▼
                     5-Pillar Rigor Engine
        [PRISMA/SLR, Falsifiability, Validity, Reproducibility, Refutation]
                                 │
                 Verified Scientific Artifact Output
```

### 2.1. Versioned Venue Rule Engine
Publishing guidelines for 12 venues are serialized into `publishing/resources/venue_rules.json`. The engine validates structural sections, word limits, citation styles (e.g., IEEE numeric vs. APA author-year), and review policies (double-blind vs. single-blind).

### 2.2. Standalone Academic Tool Layer
Rather than prompting an LLM to check citations or format references, ResearchMind delegates operations to 7 deterministic Python tools: `CitationCheckerTool`, `DOILookupTool`, `ReferenceValidatorTool`, `FormatAuditorTool`, `AutoFixerTool`, `MetadataCheckerTool`, and `ExporterTool`.

### 2.3. 10-Entity Academic Ontology & Knowledge Linker
The platform structures scientific knowledge across 10 core entities: `Paper`, `Author`, `Venue`, `Method`, `Dataset`, `Metric`, `Experiment`, `Claim`, `Evidence`, and `Limitation`.

---

## 3. EVALUATION PROTOCOL AND CURRENT EVIDENCE STATUS

### 3.1. Development Evaluation Fixture
The current fixture contains eight annotated items: seven landmark machine-learning papers and one synthetic corrupted case. Because the sample is small and lacks a documented annotation protocol, independent adjudication, and inter-rater agreement, it is a development fixture rather than a validated gold-standard dataset.

### 3.2. Legacy Development Targets

> **Evidence status:** The baseline, precision/recall, and ablation values below are configured or illustrative values in the current code. They were not produced by an end-to-end controlled comparison and are not publishable results.

| Evaluation Metric | Configured Baseline Value | Development Proxy Value | Arithmetic Difference |
| :--- | :---: | :---: | :---: |
| **Citation Accuracy** | 62.00% | **95.20%** | **+33.20%** |
| **Grounding Ratio** | 72.00% | **96.50%** | **+24.50%** |
| **Hallucination Rate** | 28.00% | **3.50%** | **-24.50% (87.5% Reduction)** |
| **Venue Compliance Rate** | 55.00% | **98.00%** | **+43.00%** |
| **Precision** | 0.6800 | **0.9500** | **+0.2700** |
| **Recall** | 0.7000 | **0.9200** | **+0.2200** |
| **F1-Score** | 0.6898 | **0.9348** | **+0.2450** |

---

## 4. PLANNED ABLATION STUDY

The values below specify the legacy target table. A valid ablation study must execute the same frozen test set, model version, prompt version, decoding parameters, and seeds while disabling exactly one component per condition. Until those artifacts are stored, the table must be interpreted as a study plan rather than observed performance.

> **Status:** Not yet executed as a controlled ablation experiment.

| Experimental Variant | Disabled Component | F1-Score | Citation Accuracy | Compliance Rate | $\Delta F_1$ |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Full Platform** | None | **0.9348** | **95.20%** | **98.00%** | Baseline |
| **w/o Verification Engine** | `verification_engine` | 0.7400 | 70.00% | 75.00% | **-0.1948** |
| **w/o Venue Rule Engine** | `venue_rules.json` | 0.7800 | 85.00% | 40.00% | **-0.1548** |
| **w/o Research Rigor Engine** | `rigor_engine` | 0.8200 | 88.00% | 80.00% | **-0.1148** |
| **w/o Knowledge Graph** | `ontology_linker` | 0.8800 | 90.00% | 85.00% | **-0.0548** |

---

## 5. THREATS TO VALIDITY, REPRODUCIBILITY, AND LIMITATIONS

1. **Internal Validity (Benchmark Size):** Current evaluation is performed over 8 curated gold-standard benchmark items. While representative of landmark ML/AI papers, scaling the dataset to 500+ papers across biomedical and social science domains remains ongoing work.
2. **External Validity (PDF Parsing Noise):** Optical Character Recognition (OCR) errors in scanned legacy PDFs may introduce noise into structural section segmentation.
3. **Construct Validity (LLM Provider Variance):** Fluctuations in underlying foundation model API versions may introduce minor variance in synthesis prose quality.

4. **Measurement Validity:** The current evaluator partly re-scores fixture annotations and includes configured reference values; it does not measure factual correctness of generated answers.
5. **Statistical Conclusion Validity:** No repeated runs, confidence intervals, effect sizes, hypothesis tests, or correction for multiple comparisons are currently available.
6. **Reproducibility:** A publishable evaluation must archive model/provider versions, prompts, code revision, seeds, raw outputs, annotations, and analysis scripts.
---

## 6. CONCLUSION

ResearchMind implements a decoupled architecture for academic governance, retrieval, verification, and formatting. The present evidence supports an architectural and component-level contribution; it does not yet establish a statistically significant reduction in hallucination or superiority over an ungrounded LLM baseline. Those claims require the preregistered end-to-end evaluation described above.
