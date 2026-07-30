# Day 6 — Appointment Booking Flow

Deploy note: slots are **persisted** (`slots` table) when a patient/doctor fetches STREAM slots. Booking/cancel update the same rows, so Railway/Render restarts keep availability consistent as long as Postgres data is retained.

```mermaid
flowchart TD
  A[Patient selects doctor] --> B[Select date]
  B --> C[GET /patient/appointments/slots]
  C --> D[STREAM: materialize Slot rows + return id/isBooked]
  D --> E{Slot available?}
  E -->|No isBooked true| F[Show slot unavailable]
  E -->|Yes| G[POST /appointment with slotId]
  G --> H{Atomic TX: lock slot}
  H -->|Already booked| F
  H -->|Free| I[Create Appointment BOOKED]
  I --> J[Mark Slot isBooked true]
  J --> K[201 Appointment + doctor + slot]
  K --> L[Optional: PATCH /appointment/:id/cancel]
  L --> M[Status CANCELLED + release slot]
```

## Endpoints

| Method | Path | Role |
|--------|------|------|
| POST | `/appointment` | PATIENT |
| GET | `/appointment/my` | PATIENT |
| PATCH | `/appointment/:id/cancel` | PATIENT |
| GET | `/doctor/appointments` | DOCTOR |
| GET | `/patient/appointments/slots` | public (Day 5 — returns `id` for STREAM) |
