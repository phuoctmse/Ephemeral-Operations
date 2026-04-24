#!/bin/bash

# EphOps Production Deployment Script (Thin Wrapper)
# Handles: ECS service deployment with task definition updates
# Dependencies: scripts/lib/common.sh, scripts/lib/aws.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/lib/common.sh"
source "${SCRIPT_DIR}/lib/aws.sh"

# ========================================================================
# Parse Arguments
# ========================================================================

IMAGE_URI=""
CLUSTER=""
SERVICE=""
REGION="${AWS_REGION:-us-east-1}"
TIMEOUT=300
TASK_FAMILY=""

usage() {
  cat <<EOF
Usage: $0 --image IMAGE_URI --cluster CLUSTER --service SERVICE [--region REGION] [--timeout TIMEOUT]

Options:
  --image IMAGE_URI        Docker image URI (required, e.g., account.dkr.ecr.region.amazonaws.com/name:tag)
  --cluster CLUSTER        ECS cluster name (required)
  --service SERVICE        ECS service name (required)
  --region REGION          AWS region (default: us-east-1)
  --timeout TIMEOUT        Deployment timeout in seconds (default: 300)
  --help                   Show this help message

EOF
  exit 1
}

while [[ $# -gt 0 ]]; do
  case $1 in
    --image)
      IMAGE_URI="$2"
      shift 2
      ;;
    --cluster)
      CLUSTER="$2"
      shift 2
      ;;


# ========================================================================
# Execute Deployment
# ========================================================================

log_info "=== Phase 1: Register Task Definition ==="
NEW_TASK_DEF=$(register_task_definition "$TASK_FAMILY" "$IMAGE_URI" "$REGION")
log_success "New task definition: ${NEW_TASK_DEF}"

log_info "=== Phase 2: Update ECS Service ==="
update_ecs_service "$CLUSTER" "$SERVICE" "$NEW_TASK_DEF" "$REGION"

log_info "=== Phase 3: Wait for Stability ==="
if ! wait_for_service_stability "$CLUSTER" "$SERVICE" "$REGION" "$TIMEOUT"; then
  log_error "Service failed to stabilize"
  exit 1
fi

log_info "=== Phase 4: Verify Deployment ==="
SERVICE_INFO=$(get_service_info "$CLUSTER" "$SERVICE" "$REGION")
RUNNING_COUNT=$(echo "$SERVICE_INFO" | jq -r '.runningCount')
DESIRED_COUNT=$(echo "$SERVICE_INFO" | jq -r '.desiredCount')
log_success "Service running with ${RUNNING_COUNT}/${DESIRED_COUNT} tasks"

log_info "=== Phase 5: Generate Evidence ==="
COMMIT_SHA="${GITHUB_SHA:-unknown}"
IMAGE_TAG="${IMAGE_URI##*/}"
generate_deployment_evidence "deployment-evidence-${CLUSTER}.md" "production" "$COMMIT_SHA" "$IMAGE_URI" "$IMAGE_TAG" "$TASK_FAMILY" "${NEW_TASK_DEF##*:}"

log_success "✅ Deployment completed successfully"
exit 0

