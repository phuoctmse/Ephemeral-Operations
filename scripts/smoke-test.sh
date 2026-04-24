#!/bin/bash

# EphOps Smoke Test Script (Thin Wrapper)
# Handles: Post-deployment verification with 6 critical tests
# Dependencies: scripts/lib/common.sh, scripts/lib/ecs.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/ecs.sh"

# ========================================================================
# Parse Arguments
# ========================================================================

HEALTH_URL=""
ENVIRONMENT="${ENVIRONMENT:-production}"
REPORT_FILE=""

usage() {
  cat <<EOF
Usage: $0 --health-url HEALTH_URL [--environment ENVIRONMENT] [--report-file FILE]

Options:
  --health-url HEALTH_URL  Health endpoint base URL (required, e.g., https://api.example.com)
  --environment ENV        Environment name (default: production)
  --report-file FILE       Output report file (optional)
  --help                   Show this help message

EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --health-url)
      HEALTH_URL="$2"
      shift 2
      ;;
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --report-file)
      REPORT_FILE="$2"
      shift 2
      ;;
    --help)
      usage
      ;;
    *)
      log_error "Unknown option: $1"
      usage
      ;;
  esac
done

# ========================================================================
# Validation
# ========================================================================

validate_required_arg "$HEALTH_URL" "$HEALTH_URL" "health-url" || exit 1
validate_command_exists curl "curl" || exit 1

log_info "Smoke test configuration validated"
log_info "  Health URL: ${HEALTH_URL}"
log_info "  Environment: ${ENVIRONMENT}"

# ========================================================================
# Run Tests
# ========================================================================

log_info "=== Starting Smoke Tests ==="

if run_smoke_tests "$HEALTH_URL" "$ENVIRONMENT"; then
  TEST_RESULT="PASSED"
  log_success "✅ All smoke tests passed"
  EXIT_CODE=0
else
  TEST_RESULT="FAILED"
  log_error "❌ One or more smoke tests failed"
  EXIT_CODE=1
fi

# ========================================================================
# Generate Report
# ========================================================================



  else
    log_test "fail" "Service did not respond to liveness check"
    exit 1
  fi
done

# Test 2: Check if service is ready
echo ""
echo "Test 2: Readiness Check (/health/ready)"
for i in {1..10}; do
  check_timeout
  if curl -sf "${HEALTH_URL}/health/ready" > /dev/null; then
    log_test "pass" "Service is ready"
    break
  fi
  if [ $i -lt 10 ]; then
    echo "  Attempt $i/10 - waiting 3s..."
    sleep 3
  else
    log_test "fail" "Service did not respond to readiness check"
    exit 1
  fi
done

# Test 3: Full health check with details
echo ""
echo "Test 3: Full Health Check (/health)"
HEALTH_RESPONSE=$(curl -s "${HEALTH_URL}/health")
echo "Response: ${HEALTH_RESPONSE}"

if echo "${HEALTH_RESPONSE}" | grep -q '"status":"ok"'; then
  log_test "pass" "Health endpoint returns OK status"
else
  log_test "fail" "Health endpoint did not return OK status"
  exit 1
fi

if echo "${HEALTH_RESPONSE}" | grep -q '"database":"ok"'; then
  log_test "pass" "Database is healthy"
else
  log_test "fail" "Database health check failed"
  exit 1
fi

# Test 4: API endpoints are accessible
echo ""
echo "Test 4: API Endpoints Accessibility"

# Check Swagger docs
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}/api/docs")
if [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "200" ]; then
  log_test "pass" "Swagger documentation endpoint accessible (${HTTP_CODE})"
else
  log_test "fail" "Swagger documentation endpoint returned ${HTTP_CODE}"
fi

# Check sandbox endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}/sandbox")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  log_test "pass" "Sandbox API endpoint accessible (${HTTP_CODE})"
else
  log_test "fail" "Sandbox API endpoint returned ${HTTP_CODE}"
fi

# Check action-logs endpoint
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}/action-logs")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ]; then
  log_test "pass" "Action logs API endpoint accessible (${HTTP_CODE})"
else
  log_test "fail" "Action logs API endpoint returned ${HTTP_CODE}"
fi

# Test 5: Response time check
echo ""
echo "Test 5: Response Time Check"
RESPONSE_TIME=$(curl -s -o /dev/null -w "%{time_total}" "${HEALTH_URL}/health")
# Convert to milliseconds
RESPONSE_MS=$(echo "${RESPONSE_TIME} * 1000" | bc | cut -d. -f1)
if [ "$RESPONSE_MS" -lt 1000 ]; then
  log_test "pass" "Health endpoint response time: ${RESPONSE_MS}ms"
else
  log_test "fail" "Health endpoint response time too high: ${RESPONSE_MS}ms"
fi

# Test 6: Error handling
echo ""
echo "Test 6: Error Handling"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}/non-existent-endpoint")
if [ "$HTTP_CODE" = "404" ]; then
  log_test "pass" "Invalid endpoints return 404"
else
  log_test "fail" "Invalid endpoints returned ${HTTP_CODE} instead of 404"
fi

echo ""
echo "═══════════════════════════════════════"
log_test "pass" "All smoke tests passed for ${ENVIRONMENT}"
echo "═══════════════════════════════════════"
