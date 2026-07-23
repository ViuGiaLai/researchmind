"""Check all modules for import errors - writes to file for reliable reading."""
import sys
import os
import traceback

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

results = []

modules_to_check = [
    'academic.ontology',
    'academic.governance',
    'academic.plugins',
    'academic.tools',
    'academic.doi_extractor',
    'academic.cache',
    'academic.evidence_engine',
    'academic.memory',
    'academic.context_builder',
    'academic.external_search',
    'academic.reasoning_engine',
    'academic.verification_engine',
    'agents.base',
    'chat.retriever',
    'chat.generator',
    'chat.generator_v2',
    'chat.prompt_factory',
    'chat.context_compressor',
    'chat.citation_entailment',
    'chat.claim_decomposition',
    'chat.failure_policy',
    'chat.metadata_filters',
    'chat.parent_retrieval',
    'chat.provider_resilience',
    'chat.cache_version',
    'chat.retrieval_policy',
    'chat.synthesizers',
    'chat.types',
    'chat.context_builder',
    'chat.prompt_budget',
    'common.text_utils',
    'common.i18n',
    'common.ai_observability',
    'common.prompt_security',
    'common.audit_trail',
    'common.errors',
    'common.secret_store',
    'common.request_context',
    'common.structured_output',
    'common.rag_ready',
    'config.settings',
    'db.models',
    'db.database',
    'db.migrations',
    'search.bm25',
    'search.vector',
    'search.hybrid',
    'search.calibration',
    'search.postprocessor',
    'search.literature_engine',
    'ingestion.chunker',
    'ingestion.metadata_quality',
    'ingestion.image_ocr',
    'graph.storage',
    'graph.builder',
    'graph.extractor',
    'graph.linker',
    'graph.router',
    'publishing.auditor',
    'publishing.guideline_fetcher',
    'publishing.latex_exporter',
    'publishing.templates',
    'evaluation.quality_evaluator',
    'evaluation.rag_evaluator',
    'evaluation.platform_evaluator',
    'evaluation.benchmark_suite',
    'evaluation.ablation_study',
    'evaluation.benchmark',
]

failed = []
for mod_name in modules_to_check:
    try:
        __import__(mod_name)
        results.append(f'OK: {mod_name}')
    except ImportError as e:
        msg = str(e)
        results.append(f'FAIL: {mod_name} -> {msg}')
        failed.append((mod_name, msg))
    except Exception as e:
        tb = traceback.format_exc()
        results.append(f'ERROR: {mod_name} -> {type(e).__name__}: {e}')
        failed.append((mod_name, f'{type(e).__name__}: {e}'))

if failed:
    results.append(f'\n*** {len(failed)} modules FAILED ***')
    for name, err in failed:
        results.append(f'  - {name}: {err}')
else:
    results.append(f'\nAll {len(modules_to_check)} modules imported OK')

out_path = os.path.join(os.path.dirname(__file__), '_tmp_import_out.txt')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(results))
