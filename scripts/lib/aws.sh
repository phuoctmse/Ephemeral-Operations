#!/bin/bash

# AWS/ECS Specific Functions for EphOps Deployment Scripts
# Provides: ECS operations, task definition management, ECR operations

# ========================================================================
# ECR (Elastic Container Registry) Functions
# ========================================================================

ecr_login() {
  local region="$1"
  
  log_info "Logging into ECR..."
  
  local password=$(aws ecr get-login-password --region "$region")
  local account_id=$(aws sts get-caller-identity --query Account --output text)
  local registry="${account_id}.dkr.ecr.${region}.amazonaws.com"
  
  echo "$password" | docker login --username AWS --password-stdin "$registry" > /dev/null 2>&1
  
  log_success "ECR login successful"
  echo "$registry"
}

ecr_push_image() {
  local image_name="$1"
  local image_tag="$2"
  local region="$3"
  
  log_info "Pushing image to ECR: ${image_name}:${image_tag}"
  
  local account_id=$(aws sts get-caller-identity --query Account --output text)
  local registry="${account_id}.dkr.ecr.${region}.amazonaws.com"
  local full_image_uri="${registry}/${image_name}:${image_tag}"
  
  docker tag "${image_name}:${image_tag}" "$full_image_uri"
  docker push "$full_image_uri"
  
  log_success "Image pushed: ${full_image_uri}"
  echo "$full_image_uri"
}

# ========================================================================
# ECS Task Definition Functions
# ========================================================================

get_current_task_definition() {
  local task_family="$1"
  local region="$2"
  
  aws ecs describe-task-definition \
    --task-definition "$task_family" \
    --region "$region" \
    --query 'taskDefinition' \
    2>/dev/null || echo ""
}

register_task_definition() {
  local task_family="$1"
  local image_uri="$2"
  local region="$3"
  
  log_info "Registering task definition: ${task_family}"
  
  local current_def=$(get_current_task_definition "$task_family" "$region")
  
  if [ -z "$current_def" ]; then
    log_error "Cannot find existing task definition: ${task_family}"
    return 1
  fi
  
  # Update image in task definition and remove non-register fields
  local new_def=$(echo "$current_def" | \
    jq ".containerDefinitions[0].image=\"${image_uri}\" | \
        del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .registeredAt, .registeredBy)")
  
  local registered=$(aws ecs register-task-definition \
    --cli-input-json "$(echo "$new_def" | jq -c .)" \
    --region "$region" \
    --query 'taskDefinition.{arn:taskDefinitionArn,revision:revision}' \
    --output json)
  
  local arn=$(echo "$registered" | jq -r '.arn')
  local revision=$(echo "$registered" | jq -r '.revision')
  
  log_success "Task definition registered: ${arn}:${revision}"
  echo "${arn}:${revision}"
}

# ========================================================================
# ECS Service Functions
# ========================================================================

update_ecs_service() {
  local cluster="$1"
  local service="$2"
  local task_definition="$3"
  local region="$4"
  
  log_info "Updating ECS service: ${service}"
  
  aws ecs update-service \
    --cluster "$cluster" \
    --service "$service" \
    --task-definition "$task_definition" \
    --force-new-deployment \
    --region "$region" \
    --query 'service.{status:status,runningCount:runningCount,desiredCount:desiredCount}' \
    --output json | jq .
  
  log_success "Service update initiated"
}

wait_for_service_stability() {
  local cluster="$1"
  local service="$2"
  local region="$3"
  local timeout="${4:-300}"
  
  log_info "Waiting for service to stabilize (timeout: ${timeout}s)..."
  
  local start_time=$(date +%s)
  
  while true; do
    local current_time=$(date +%s)
    local elapsed=$((current_time - start_time))
    
    if [ $elapsed -gt $timeout ]; then
      log_error "Service deployment timed out after ${timeout}s"
      return 1
    fi
    
    local status=$(aws ecs describe-services \
      --cluster "$cluster" \
      --services "$service" \
      --region "$region" \
      --query 'services[0].{runningCount:runningCount,desiredCount:desiredCount,status:status}' \
      --output json)
    
    local running=$(echo "$status" | jq -r '.runningCount')
    local desired=$(echo "$status" | jq -r '.desiredCount')
    local svc_status=$(echo "$status" | jq -r '.status')
    
    log_info "[${elapsed}s] Running: ${running}/${desired} | Status: ${svc_status}"
    
    if [ "$running" = "$desired" ] && [ "$svc_status" = "ACTIVE" ]; then
      log_success "Service stabilized with ${running}/${desired} tasks"
      return 0
    fi
    
    sleep 5
  done
}

get_service_info() {
  local cluster="$1"
  local service="$2"
  local region="$3"
  
  aws ecs describe-services \
    --cluster "$cluster" \
    --services "$service" \
    --region "$region" \
    --query 'services[0]' \
    --output json
}

# ========================================================================
# ECS Task Rollback Functions
# ========================================================================

list_task_definitions() {
  local task_family="$1"
  local region="$2"
  local limit="${3:-5}"
  
  aws ecs list-task-definition-revisions \
    --family-prefix "$task_family" \
    --region "$region" \
    --sort DESCENDING \
    --query "taskDefinitionArns[0:${limit}]" \
    --output json
}

get_previous_task_definition() {
  local task_family="$1"
  local region="$2"
  
  local revisions=$(list_task_definitions "$task_family" "$region" 2)
  local previous=$(echo "$revisions" | jq -r '.[1]' 2>/dev/null || echo "")
  
  if [ -z "$previous" ]; then
    log_error "No previous task definition found"
    return 1
  fi
  
  echo "$previous"
}

get_task_definition_image() {
  local task_definition="$1"
  local region="$2"
  
  aws ecs describe-task-definition \
    --task-definition "$task_definition" \
    --region "$region" \
    --query 'taskDefinition.containerDefinitions[0].image' \
    --output text
}

# Export functions
export -f ecr_login ecr_push_image
export -f get_current_task_definition register_task_definition
export -f update_ecs_service wait_for_service_stability get_service_info
export -f list_task_definitions get_previous_task_definition get_task_definition_image
