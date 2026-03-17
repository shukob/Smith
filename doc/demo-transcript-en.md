# Demo Script (English) - Smith

## Scenario: Shift Management System for a Restaurant Chain

### Opening (AI speaks first after connect)
**AI**: Hi, I'm ready. Let's begin our requirements and architecture design meeting. What's the project about?

### Phase 1: Project Overview
**User**: We're building a shift management system for a restaurant chain with about 50 locations.

**AI**: Got it. 50 locations — that's a significant scale. What are the key pain points with the current process?

**User**: Right now managers manually create shifts in spreadsheets. It takes hours and often results in understaffing or overstaffing.

**AI**: Understood. So the core need is automated shift optimization. What constraints should I know about — labor laws, employee preferences, skill requirements?

### Phase 2: Requirements Deep Dive
**User**: Yes, we need to comply with Japanese labor law — maximum 8 hours per shift, mandatory breaks, no more than 40 hours per week. Employees should also be able to submit availability preferences.

**AI**: Clear. I'll capture that as a high-priority requirement.
*(AI calls extract_requirement: "REQ-001: Shift optimization with labor law compliance")*

**User**: We also need real-time notifications when shifts change.

**AI**: Push notifications or in-app?

**User**: Both. And managers should be able to approve shift swaps between employees.

**AI**: Got it — shift swap workflow with manager approval.
*(AI calls extract_requirement: "REQ-002: Shift swap with approval workflow")*

### Phase 3: Architecture Discussion
**User**: What kind of architecture would you recommend?

**AI**: For 50 locations with real-time sync, I'd suggest a microservices approach. Core services: auth, shift engine, notification service, and an optimization engine. The optimization engine could run as a scheduled Cloud Run job.

*(Background Agent populates architecture diagram with nodes: Auth Service, Shift Engine, Notification Service, Optimization Engine, Database)*

**User**: Should we use a relational database or NoSQL?

**AI**: For shift data with complex constraints and queries, PostgreSQL is the better fit. You'll need joins for employee-shift-location relationships. NoSQL for the notification queue though.

*(Background Agent adds PostgreSQL and Redis nodes to architecture)*

### Phase 4: Timeline
**User**: We want to launch an MVP in 3 months.

**AI**: That's tight but doable. I'd prioritize: month 1 for auth and basic shift CRUD, month 2 for the optimization engine, month 3 for notifications and testing.

*(Background Agent creates schedule items: "Auth + Shift CRUD: Month 1", "Optimization Engine: Month 2", "Notifications + QA: Month 3")*

### Phase 5: Interruption Demo (Speculative Turn-taking)
**AI**: For the optimization algorithm, I'd recommend starting with a constraint satisfaction approach using—

**User**: *(interrupts)* Actually, we already have a Python library for that. Can we just integrate it?

**AI**: *(yields immediately)* Perfect, that saves significant development time. What's the library? We can wrap it as a microservice.

### Closing
**User**: This is looking great. Can you summarize what we've covered?

**AI**: Sure. We've defined a shift management system for 50 restaurant locations with automated optimization, labor law compliance, shift swap workflows, and real-time notifications. Architecture is microservices on GCP with PostgreSQL. MVP timeline is 3 months.
