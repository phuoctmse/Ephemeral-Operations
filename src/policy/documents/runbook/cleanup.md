# EphOps Cleanup Runbook

## Automatic Cleanup
The cleanup worker runs every 5 minutes and destroys environments that have exceeded their TTL.

### Cleanup Steps
1. Query all RUNNING environments where `expiresAt < now()`
2. For each expired environment:
   a. Call EC2 `terminateInstance` with the environment's `resourceId`
   b. Calculate `costIncurred = hoursElapsed * hourlyCost`
   c. Update environment status to DESTROYED
3. Log cleanup results

## Manual Cleanup
To manually destroy an environment:
```
DELETE /sandbox-env/:id
```

## Failure Handling
- If EC2 termination fails, the environment is still marked DESTROYED in the database to prevent cost accumulation.
- Cleanup errors are logged but do not stop the cleanup loop.

## Keywords
cleanup, destroy, terminate, expired, ttl, worker, cron, manual, cost incurred
