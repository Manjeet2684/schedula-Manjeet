# Day 6 — Testing Guide (local + Postman)

## Env (local & deploy)

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=schedula
JWT_SECRET=secret
PORT=3000
# Optional for Railway/Render:
# DATABASE_URL=postgresql://user:pass@host:5432/db
# DB_SSL=true
```

Migrations run automatically on boot (`migrationsRun: true`, `synchronize: false`).

```bash
npm install
npm run start:dev
```

## Seed (SQL) — optional if you already have doctor/patient/availability

```sql
-- Assumes users/doctors/patients already exist from signup+profile APIs.
-- Prefer the HTTP seed steps below for a full demo.
```

### HTTP seed steps

1. Signup/login **DOCTOR** → create `/doctor/profile`
2. `POST /doctor/availability` — Monday `09:00`–`12:00`
3. `POST /doctor/schedule-config` — `{ "schedulingType":"STREAM","slotDuration":15,"bufferTime":5 }`
4. Signup/login **PATIENT** → create `/patient/profile`
5. `GET /patient/appointments/slots?doctorId=...&date=YYYY-MM-DD` (future Monday) → copy a slot `id`
6. Book / list / cancel using curls below

---

## Per-API Postman / cURL (import via Postman → Import → Raw text)

Replace tokens / ids.

### 1) Book appointment — expect **201**
```bash
curl -X POST "http://localhost:3000/appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_JWT>" \
  -d "{\"doctorId\":\"<DOCTOR_ID>\",\"slotId\":\"<SLOT_ID>\",\"date\":\"2026-09-21\",\"startTime\":\"09:00\",\"endTime\":\"09:15\"}"
```

### 2) Duplicate book same slot — expect **400** `Slot already booked`
(same body again)

### 3) Mismatched slotId vs times — expect **400**
```bash
curl -X POST "http://localhost:3000/appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_JWT>" \
  -d "{\"doctorId\":\"<DOCTOR_ID>\",\"slotId\":\"<SLOT_ID>\",\"date\":\"2026-09-21\",\"startTime\":\"09:00\",\"endTime\":\"09:30\"}"
```

### 4) Past slot — expect **400**
```bash
curl -X POST "http://localhost:3000/appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_JWT>" \
  -d "{\"doctorId\":\"<DOCTOR_ID>\",\"slotId\":\"<SLOT_ID>\",\"date\":\"2020-01-06\",\"startTime\":\"09:00\",\"endTime\":\"09:15\"}"
```

### 5) Patient list — expect **200** (array)
```bash
curl "http://localhost:3000/appointment/my" \
  -H "Authorization: Bearer <PATIENT_JWT>"
```

### 6) Doctor list — expect **200** (array)
```bash
curl "http://localhost:3000/doctor/appointments" \
  -H "Authorization: Bearer <DOCTOR_JWT>"
```

### 7) Cancel — expect **200**
```bash
curl -X PATCH "http://localhost:3000/appointment/<APPOINTMENT_ID>/cancel" \
  -H "Authorization: Bearer <PATIENT_JWT>"
```

### 8) Re-cancel — expect **400**
(same as 7)

### 9) Cancel as other patient — expect **403**
(use another patient JWT)

### 10) Malformed appointment id — expect **400**
```bash
curl -X PATCH "http://localhost:3000/appointment/not-a-uuid/cancel" \
  -H "Authorization: Bearer <PATIENT_JWT>"
```

### 11) Doctor not found — expect **404**
```bash
curl -X POST "http://localhost:3000/appointment" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <PATIENT_JWT>" \
  -d "{\"doctorId\":\"00000000-0000-4000-8000-000000000000\",\"slotId\":\"00000000-0000-4000-8000-000000000001\",\"date\":\"2026-09-21\",\"startTime\":\"09:00\",\"endTime\":\"09:15\"}"
```

Full collection: `docs/appointment-apis.postman_collection.json`

## Automated tests

```bash
npm test -- appointment.service.spec.ts
```
