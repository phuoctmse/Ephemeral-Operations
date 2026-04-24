#!/bin/bash

# EphOps Production Rollback Script (Thin Wrapper)
# Handles: ECS service rollback to previous task definition
# Dependencies: scripts/lib/common.sh, scripts/lib/aws.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/aws.sh"

# ========================================================================
# Parse Arguments
# ========================================================================

CLUSTER=""
SERVICE=""
REGION="${AWS_REGION:-us-east-1}"
TIMEOUT=300
REASON=""

usage() {
  cat <<EOF
Usage: $0 --cluster CLUSTER --service SERVICE [--reason REASON] [--region REGION] [--timeout TIMEOUT]

Options:
  --cluster CLUSTER        ECS cluster name (required)
  --service SERVICE        ECS service name (required)
  --reason REASON          Rollback reason (optional)
  --region REGION          AWS region (default: us-east-1)
  --timeout TIMEOUT        Rollback timeout in seconds (default: 300)
  --help                   Show this help message

EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --cluster)
      CLUSTER="$2"
      shift 2
      ;;
    --service)
      SERVICE="$2"
      shift 2
      ;;
    --reason)
      REASON="$2"
      shift 2
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
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

validate_required_arg "$CLUSTER" "$CLUSTER" "cluster" || exit 1
validate_required_arg "$SERVICE" "$SERVICE" "service" || exit 1
validate_command_exists jq "jq" || exit 1
check_aws_credentials "$REGION" || exit 1

log_info "Rollback configuration validated"
log_info "  Cluster: ${CLUSTER}"
log_info "  Service: ${SERVICE}"
log_info "  Reason: ${REASON:-unspecified}"

# ========================================================================
# Get Current & Previous Task Definitions
# ========================================================================

log_info "=== Phase 1: Identify Rollback Target ==="

CURRENT_TASK_DEF=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION" --query 'services[0].taskDefinition' --output text 2>/dev/null)
TASK_FAMILY=$(echo "$CURRENT_TASK_DEF" | rev | cut -d':' -f2- | rev)

log_info "Current task definition: ${CURRENT_TASK_DEF}"

PREVIOUS_TASK_DEF=$(get_previous_task_definition "$TASK_FAMILY" "$REGION")
log_success "Previous task definition identified: ${PREVIOUS_TASK_DEF}"

# Get image from previous task def
PREVIOUS_IMAGE=$(get_task_definition_image "$PREVIOUS_TASK_DEF" "$REGION")
log_info "Previous image: ${PREVIOUS_IMAGE}"


# ========================================================================
# Execute Rollback
# ========================================================================

log_info "=== Phase 2: Update Service with Previous Task Definition ==="
update_ecs_service "$CLUSTER" "$SERVICE" "$PREVIOUS_TASK_DEF" "$REGION"

log_info "=== Phase 3: Wait for Rollback to Complete ==="
if ! wait_for_service_stability "$CLUSTER" "$SERVICE" "$REGION" "$TIMEOUT"; then
  log_error "Rollback failed to complete"
  exit 1
fi

log_info "=== Phase 4: Verify Rollback ==="
SERVICE_INFO=$(get_service_info "$CLUSTER" "$SERVICE" "$REGION")
RUNNING_COUNT=$(echo "$SERVICE_INFO" | jq -r '.runningCount')
DESIRED_COUNT=$(echo "$SERVICE_INFO" | jq -r '.desiredCount')
log_success "Service rolled back with ${RUNNING_COUNT}/${DESIRED_COUNT} tasks"

log_info "=== Phase 5: Generate Rollback Evidence ==="
generate_rollback_evidence "rollback-evidence-${CLUSTER}.md" "${REASON:-automated rollback}" "$PREVIOUS_IMAGE" "$TASK_FAMILY" "${PREVIOUS_TASK_DEF##*:}"

log_success "✅ Rollback completed successfully"
log_warn "⚠️  Post-rollback actions required:"
log_warn "    1. Review logs for failure cause"
log_warn "    2. Fix issue in source code"
log_warn "    3. Re-test in staging"
log_warn "    4. Create new deployment PR"

exit 0

