# Product

## Register

product

## Users

Primary: DevOps engineers (solo or small team) managing ephemeral cloud environments. They work at a terminal, understand infrastructure, and expect tools to respect their technical fluency. They glance at this dashboard to verify system state, check costs, and audit agent decisions — not to be guided through a workflow.

Secondary: SREs managing Kubernetes/EKS clusters who need to inspect environment lifecycle and LLM decision traces.

Context: Typically on a large monitor, often in a dim room, during or after an incident or provisioning event. They are in a task — the UI should disappear into it.

## Product Purpose

EphOps provisions and manages ephemeral cloud environments via an AI agent. The dashboard surfaces FinOps metrics (cost, LLM latency, guardrails activity), environment lifecycle state, and agent audit trails. Success means an engineer can answer "what did the agent decide, why, and what did it cost?" in under 30 seconds.

## Brand Personality

Precise. Technical. Direct.

No hand-holding. No decorative chrome. Every element earns its place by carrying information.

## Anti-references

- **AWS Console** — nested navigation, sidebar confusion, information overload. EphOps should never require more than two clicks to reach any data.
- **Jira** — excessive color, unnecessary complexity, UI that competes with the work. EphOps uses color only to convey state, never decoration.
- Generic SaaS dashboards with hero-metric templates (big number, gradient accent, supporting stats). EphOps data is operational, not marketing.

## Design Principles

1. **Data over decoration.** Every pixel either carries information or creates space for information to breathe. Decorative elements are prohibited.
2. **State is the only color.** Color communicates CREATING / RUNNING / DESTROYED / FAILED and error / warning / success. It does not decorate.
3. **Respect technical fluency.** Dense tables, monospace values, raw IDs, and ISO timestamps are features, not problems. Don't abstract away precision.
4. **Fail visibly, recover gracefully.** Error states are first-class citizens. Every component has an error state that names the problem and offers a recovery action.
5. **The tool disappears into the task.** Navigation is predictable. Layouts are consistent. Surprise is not a virtue here.

## Accessibility & Inclusion

WCAG AA. Sufficient color contrast for all text and state indicators. Focus-visible on all interactive elements. No color-only state communication — pair color with text or icon.
