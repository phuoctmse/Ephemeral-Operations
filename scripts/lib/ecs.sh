#!/bin/bash

# Health Check & Smoke Testing Functions for EphOps
# Provides: Health checks, smoke test orchestration, test reporting

# ========================================================================
# Health Check Functions
# ========================================================================

check_health_endpoint() {
  local health_url="$1"
  local max_retries="${2:-10}"
  local retry_interval="${3:-3}"
  
  log_info "Checking health endpoint: ${health_url}"
  
  for ((i=1; i<=max_retries; i++)); do
    if curl -sf "${health_url}" > /dev/null 2>&1; then
      log_success "Health endpoint responding (attempt $i/${max_retries})"
      return 0
    fi
    
    if [ $i -lt $max_retries ]; then
      log_warn "Health check attempt $i/${max_retries} failed, retrying in ${retry_interval}s..."
      sleep "$retry_interval"
    fi
  done
  
  log_error "Health endpoint failed after ${max_retries} attempts"
  return 1
}

get_health_status() {
  local health_url="$1"
  
  local response=$(curl -s "${health_url}/health" || echo "{}")
  
  if echo "$response" | grep -q '"status":"ok"'; then
    echo "ok"
    return 0
  else
    echo "$response"
    return 1
  fi
}

verify_database_health() {
  local health_url="$1"
  
  local response=$(curl -s "${health_url}/health" || echo "{}")
  
  if echo "$response" | grep -q '"database":"ok"'; then
    log_success "Database health check passed"
    return 0
  else
    log_error "Database health check failed"
    return 1
  fi
}

# ========================================================================
# API Endpoint Tests
# ========================================================================

test_api_endpoint() {
  local endpoint="$1"
  local expected_codes="${2:-200}"
  
  local http_code=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null || echo "000")
  
  if echo "$expected_codes" | grep -q "$http_code"; then
    log_success "API endpoint responding: ${endpoint} (${http_code})"
    return 0
  else
    log_error "API endpoint failed: ${endpoint} (got ${http_code}, expected ${expected_codes})"
    return 1
  fi
}

check_response_time() {
  local endpoint="$1"
  local max_ms="${2:-1000}"
  
  local response_time=$(curl -s -o /dev/null -w "%{time_total}" "$endpoint" 2>/dev/null || echo "999")
  local response_ms=$(echo "$response_time * 1000" | bc 2>/dev/null | cut -d. -f1 || echo "999")
  
  if [ "$response_ms" -lt "$max_ms" ]; then
    log_success "Response time acceptable: ${response_ms}ms (< ${max_ms}ms)"
    return 0
  else
    log_warn "Response time high: ${response_ms}ms (threshold: ${max_ms}ms)"
    return 1
  fi
}

# ========================================================================
# Smoke Test Orchestration
# ========================================================================

run_smoke_tests() {
  local health_url="$1"
  local environment="${2:-staging}"
  
  log_info "Running smoke tests against ${environment}"
  log_info "Health URL: ${health_url}"
  
  local tests_passed=0
  local tests_failed=0
  
  # Test 1: Liveness
  if check_health_endpoint "${health_url}/health/live" 10 3; then
    ((tests_passed++))
  else
    ((tests_failed++))
  fi
  
  # Test 2: Readiness
  if check_health_endpoint "${health_url}/health/ready" 10 3; then
    ((tests_passed++))
  else
    ((tests_failed++))
  fi
  
  # Test 3: Full health
  if check_health_endpoint "${health_url}/health" 10 3; then
    ((tests_passed++))
  else
    ((tests_failed++))
  fi
  
  # Test 4: Database check
  if verify_database_health "${health_url}"; then
    ((tests_passed++))
  else
    ((tests_failed++))
  fi
  
  # Test 5: Response time
  if check_response_time "${health_url}/health" 1000; then
    ((tests_passed++))
  else
    ((tests_failed++))
  fi
  
  # Test 6: API endpoints (sandbox)
  if test_api_endpoint "${health_url}/sandbox" "200 401"; then
    ((tests_passed++))
  else
    ((tests_failed++))
  fi
  
  log_info "Smoke tests complete: ${tests_passed} passed, ${tests_failed} failed"
  
  if [ $tests_failed -gt 0 ]; then
    return 1
  fi
  
  return 0
}

# ========================================================================
# Test Reporting
# ========================================================================

generate_smoke_test_report() {
  local output_file="$1"
  local health_url="$2"
  local environment="$3"
  local test_result="${4:-unknown}"
  
  local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  
  cat > "$output_file" <<EOF
# Smoke Test Report

**Environment**: ${environment}
**Health URL**: ${health_url}
**Timestamp**: ${timestamp}
**Result**: ${test_result}

## Tests Executed
- Liveness check (/health/live)
- Readiness check (/health/ready)
- Full health check (/health)
- Database connectivity
- Response time validation
- API endpoint accessibility

## Interpretation
If all tests passed: Service is ready for traffic
If any test failed: Service requires investigation

EOF

  log_success "Smoke test report generated: ${output_file}"
}

# Export functions
export -f check_health_endpoint get_health_status verify_database_health
export -f test_api_endpoint check_response_time
export -f run_smoke_tests generate_smoke_test_report
