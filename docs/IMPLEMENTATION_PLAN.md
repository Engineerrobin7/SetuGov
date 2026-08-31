# SetuGov Implementation Plan

## Overview
SetuGov is an interoperability and orchestration platform designed to bridge disparate departmental systems in the government of Maharashtra without replacing them. This MVP implements a simulated ecosystem of 4 departmental services (Identity, Eligibility, Employment, and Benefits) integrated through a unified workflow and connector engine.

## 1. Directory Structure
```
setugov/
├── package.json (root workspace)
├── server/
│   ├── src/
│   │   ├── api/             (express routes)
│   │   ├── auth/            (jwt auth & bcrypt rbac)
│   │   ├── consent/         (consent checks & logic)
│   │   ├── applications/    (application states)
│   │   ├── services/        (government employment service definition)
│   │   ├── departments/     (department registrations & controllers)
│   │   ├── connectors/      (connector engine adapters)
│   │   ├── normalization/   (canonical models & transformers)
│   │   ├── validation/      (zod validators for incoming data)
│   │   ├── workflow/        (state machine, sequential flow executor, and cron retry)
│   │   ├── events/          (event bus for audits and timeline)
│   │   ├── notifications/   (user alert messages)
│   │   ├── audit/           (database-backed audit logs)
│   │   ├── database/        (prisma client)
│   │   └── config/          (environment variable configuration)
│   ├── prisma/              (schema.prisma & migrations)
│   ├── tests/               (jest/vitest test suite)
│   └── package.json         (server dependencies: express, prisma, zod, jsonwebtoken, bcrypt)
├── apps/
│   └── web/                 (next.js client application with tailwind css)
└── docs/
    └── ARCHITECTURE.md      (architectural documentation)
```

## 2. Technology Stack
- **Frontend**: Next.js 14+ (App Router), React 18, TypeScript, Tailwind CSS.
- **Backend**: Node.js, Express.js, TypeScript.
- **Database**: PostgreSQL (via Prisma ORM).
- **Security**: JWT tokens, Bcrypt for passwords, RBAC middleware.
- **Validation**: Zod.

## 3. Database Schema Models
We will create models for:
- `User` (id, email, password, role [CITIZEN, OFFICIAL, ADMIN])
- `Citizen` (id, userId, citizenId [MH12345], name, dob, address, contact)
- `Official` (id, userId, department, name)
- `Service` (id, name, description)
- `Application` (id, requestId [SG-2026-000123], citizenId, serviceId, status, canonicalData, currentStep)
- `Consent` (id, applicationId, status [GRANTED, REVOKED], purpose, timestamp, ipAddress)
- `WorkflowInstance` (id, applicationId, status)
- `WorkflowStep` (id, workflowInstanceId, departmentId, status, retries, errorMessage)
- `AuditLog` (id, actorId, action, timestamp, requestId, prevStatus, newStatus, metadata)
- `SystemEvent` (id, eventType, timestamp, payload)
- `Notification` (id, citizenId, message, read, timestamp)

## 4. API Specification
- **Auth**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- **Services**: `GET /api/services`, `GET /api/services/:id`
- **Applications**:
  - `POST /api/applications`
  - `GET /api/applications`
  - `GET /api/applications/:id`
  - `POST /api/applications/:id/consent`
  - `GET /api/applications/:id/status`
  - `GET /api/applications/:id/timeline`
- **Official Portal**:
  - `GET /api/official/applications`
  - `GET /api/official/applications/:id`
  - `GET /api/official/applications/:id/workflow`
  - `GET /api/official/applications/:id/audit`
- **Admin Control**:
  - `GET /api/admin/health`
  - `GET /api/admin/connectors`
  - `GET /api/admin/events`
  - `GET /api/admin/logs`
  - `GET /api/admin/workflows/failures`
  - `POST /api/admin/demo/department-b/failure`
  - `POST /api/admin/demo/department-b/restore`
- **Internal**:
  - `POST /api/internal/workflows/:id/start`
  - `POST /api/internal/workflows/:id/retry`
- **Mock Departments**:
  - `POST /mock/identity/verify`
  - `POST /mock/eligibility/check`
  - `POST /mock/employment/verify`
  - `POST /mock/benefits/process`

## 5. Mock Department Systems & Schema Variation
- **Department A (Identity)**: Uses snake_case variables and custom responses.
- **Department B (Eligibility)**: Uses camelCase variables and checks eligibility status. Simulates HTTP 503 errors when the failure flag is toggled.
- **Department C (Employment)**: Uses kebab-case or distinct property names (candidate_id, skill_status).
- **Department D (Benefits)**: Uses custom scheme payment mapping (recipientId, amountRequested).

## 6. Integration and Normalization Layer
Connectors normalize incoming responses to a common internal model.
Example mappings:
- Identity name field: `full_name` → `name`
- Eligibility name field: `applicantName` → `name`
- Employment name field: `name` → `name`

## 7. Workflow State Machine & Failure Simulation
The engine coordinates sequentially:
1. `IDENTITY_VERIFICATION`
2. `ELIGIBILITY_VERIFICATION`
3. `EMPLOYMENT_VERIFICATION`
4. `SERVICE_PROCESSING`

When Department B fails, the step status transitions to `WAITING` or `RETRYING`. The admin dashboard allows the operator to restore the department. A background scheduler or user-triggered REST endpoint `POST /api/internal/workflows/:id/retry` resumes the workflow, allowing it to complete.

## 8. Verification & Demo Scenario
- **Scenario 1: Happy Path**: Citizen applies, grants consent, and the orchestrator executes all 4 steps successfully to completion.
- **Scenario 2: Failure & Resume**:
  - Admin toggles "Simulate Department B Failure".
  - Citizen submits application.
  - Eligibility step fails. Application transitions to `WAITING` / `RETRYING`.
  - Admin toggles "Restore Department B".
  - Orchestrator retries. Application resumes and proceeds to `COMPLETED`.
