#!/bin/bash

# Shared Common Functions for EphOps Deployment Scripts
# Provides: logging, validation, error handling, input checks

# Enable strict mode
set -euo pipefail

# ========================================================================
# Logging Functions
# ========================================================================

log_info() {
  local msg="$1"
  echo "ℹ️  [$(date +'%Y-%m-%d %H:%M:%S')] ${msg}"
}

log_success() {
  local msg="$1"
  echo "✅ [$(date +'%Y-%m-%d %H:%M:%S')] ${msg}"
}

log_warn() {
  local msg="$1"
  echo "⚠️  [$(date +'%Y-%m-%d %H:%M:%S')] ${msg}" >&2
}

log_error() {
  local msg="$1"
  echo "❌ [$(date +'%Y-%m-%d %H:%M:%S')] ${msg}" >&2
}

# ========================================================================
# Validation Functions
# ========================================================================

validate_required_arg() {
  local var_name="$1"
  local var_value="$2"
  local arg_name="${3:-${var_name}}"
  
  if [ -z "$var_value" ]; then
    log_error "Required argument --${arg_name} is missing"
    return 1
  fi
}

validate_required_var() {
  local var_name="$1"
  local var_value="${2:-}"
  
  if [ -z "$var_value" ]; then
    log_error "Required environment variable ${var_name} is not set"
    return 1
  fi
}

validate_command_exists() {
  local cmd="$1"
  local display_name="${2:-${cmd}}"
  
  if ! command -v "$cmd" &> /dev/null; then
    log_error "${display_name} not found. Please install it."
    return 1
  fi
}

validate_file_exists() {
  local file="$1"
  
  if [ ! -f "$file" ]; then
    log_error "File not found: ${file}"
    return 1
  fi
}

validate_commit_sha() {
  local sha="$1"
  
  if ! [[ "$sha" =~ ^[a-f0-9]{40}$ ]]; then
    log_error "Invalid commit SHA format: ${sha}"
    return 1
  fi
}

validate_image_tag() {
  local tag="$1"
  local pattern="$2"
  
  if ! [[ "$tag" =~ ${pattern} ]]; then
    log_error "Invalid image tag format: ${tag}"
    log_info "Expected pattern: ${pattern}"
    return 1
  fi
}

# ========================================================================
# AWS Authentication Check
# ========================================================================

check_aws_credentials() {
  local region="${1:-us-east-1}"
  
  if ! command -v aws &> /dev/null; then
    log_error "AWS CLI not found. Please install AWS CLI v2."
    return 1
  fi
  
  if ! aws sts get-caller-identity --region "$region" > /dev/null 2>&1; then
    log_error "AWS credentials not configured or invalid for region: ${region}"
    return 1
  fi
  
  local account_id=$(aws sts get-caller-identity --query Account --output text --region "$region")
  local user_arn=$(aws sts get-caller-identity --query Arn --output text --region "$region")
  
  log_success "AWS credentials verified"
  log_info "Account: ${account_id}"
  log_info "Principal: ${user_arn}"
  
  return 0
}

# ========================================================================
# Deployment Artifact Generation
# ========================================================================

generate_deployment_evidence() {
  local output_file="$1"
  local environment="$2"
  local commit_sha="$3"
  local image_uri="$4"
  local image_tag="$5"
  local task_family="$6"
  local task_revision="$7"
  
  local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  local triggered_by="${GITHUB_ACTOR:-unknown}"
  local branch="${GITHUB_REF_NAME:-unknown}"
  
  cat > "$output_file" <<EOF
# Deployment Evidence - ECS Fargate

**Environment**: ${environment}
**Timestamp**: ${timestamp}
**Triggered By**: ${triggered_by}
**Branch**: ${branch}

## Commit & Image
**Commit SHA**: ${commit_sha}
**Image Tag**: ${image_tag}
**Image URI**: ${image_uri}

## ECS Task Definition
**Task Family**: ${task_family}
**Task Revision**: ${task_revision}
**Task Definition ARN**: arn:aws:ecs:us-east-1:ACCOUNT_ID:task-definition/${task_family}:${task_revision}

## Deployment Metadata
**Generated At**: ${timestamp}
**Script Version**: 1.0
**Exit Code**: 0 (Success)

EOF

  log_success "Deployment evidence saved to: ${output_file}"
}

generate_rollback_evidence() {
  local output_file="$1"
  local reason="$2"
  local target_image="$3"
  local task_family="$4"
  local task_revision="$5"
  
  local timestamp=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  local triggered_by="${GITHUB_ACTOR:-unknown}"
  
  cat > "$output_file" <<EOF
# Rollback Evidence - ECS Fargate

**Status**: Executed
**Timestamp**: ${timestamp}
**Triggered By**: ${triggered_by}

## Rollback Details
**Reason**: ${reason}
**Target Image**: ${target_image}
**Target Task Family**: ${task_family}
**Target Task Revision**: ${task_revision}

## Remediation Steps
1. Review logs: \`aws logs tail /ecs/ephops-prod --follow --since=10m\`
2. Check task health: \`aws ecs describe-tasks --cluster ephops-prod-cluster --tasks <task-arn>\`
3. Post-mortem analysis required
4. Fix root cause in source code
5. Re-test in staging environment
6. Create new deployment PR

EOF

  log_success "Rollback evidence saved to: ${output_file}"
}

# ========================================================================
# JSON Output (for CI/CD integration)
# ========================================================================

output_json() {
  local key="$1"
  local value="$2"
  
  # Check if jq is available for JSON validation
  if command -v jq &> /dev/null; then
    echo "{\"${key}\": \"${value}\"}" | jq .
  else
    echo "{\"${key}\": \"${value}\"}"
  fi
}

# Export functions
export -f log_info log_success log_warn log_error
export -f validate_required_arg validate_required_var validate_command_exists
export -f validate_file_exists validate_commit_sha validate_image_tag
export -f check_aws_credentials
export -f generate_deployment_evidence generate_rollback_evidence
export -f output_json
