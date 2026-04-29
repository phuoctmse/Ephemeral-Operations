# EphOps Guardrails Policy

## Allowed Instance Types
Only the following EC2 instance types are permitted:
- t3.micro (0.0104 USD/hour)
- t4g.nano (0.0042 USD/hour)

Any request for other instance types (t2.medium, m5.large, c5.xlarge, GPU instances, etc.) MUST be REJECTED.

## TTL Limits
- Minimum TTL: 0.5 hours
- Maximum TTL: 2 hours
- Default TTL: 1 hour

Requests exceeding 2 hours TTL MUST be REJECTED or capped at 2 hours.

## Concurrency Limits
- Maximum concurrent RUNNING environments: 2
- If limit is reached, new provisioning requests MUST be REJECTED until an existing environment is destroyed.

## Cost Guardrails
- Only free-tier or low-cost instance types are allowed.
- Total expected cost per environment must not exceed 0.025 USD.
- Reject any request that would exceed this threshold.

## Keywords
guardrails, instance type, allowed, ttl, concurrency, limit, reject, cost threshold, policy
