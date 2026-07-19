# ResearchMind AI Gateway

This service holds provider credentials, enforces user quotas, and proxies
generation, streaming, and embedding calls. Documents, retrieval, projects,
GraphRAG, and citation validation remain in the desktop backend.

Local development:

```bash
pip install -r cloud_gateway/requirements.txt
copy cloud_gateway/.env.example .env
uvicorn cloud_gateway.main:app --port 8080
```

Production must set `ENVIRONMENT=production`, configure Firebase and at least
one provider, and keep `ALLOW_UNAUTHENTICATED=false`. Provider keys belong in
the cloud secret manager. Desktop release CI packages only the public gateway
URL from the `RESEARCHMIND_CLOUD_URL` repository variable.

