# EphOps Incident Response Runbook

## LLM Unavailable
**Symptom:** Agent returns REJECT with "LLM unavailable" reasoning.
**Action:**
1. Check Ollama service: `GET /health`
2. Verify `OLLAMA_BASE_URL` env var is correct
3. If primary model is down, set `OLLAMA_FALLBACK_MODEL` to a smaller available model
4. All requests fail-closed (REJECT) when LLM is unavailable — this is expected safe behavior

## Concurrency Limit Reached
**Symptom:** Provisioning blocked with "Maximum concurrent environments reached".
**Action:**
1. List active environments: `GET /sandbox-env`
2. Destroy an idle environment: `DELETE /sandbox-env/:id`
3. Check cleanup worker is running (should auto-destroy expired envs every 5 minutes)

## AWS Provisioning Failure
**Symptom:** Environment stuck in CREATING or FAILED status.
**Action:**
1. Check ActionLog for the environment: `GET /action-log/env/:id`
2. Verify AWS credentials and endpoint in env vars
3. For LocalStack: ensure `AWS_ENDPOINT=http://localhost:4566`

## Keywords
incident, llm down, unavailable, concurrency, stuck, failed, aws, localstack, health
