# Day 5 — Advanced Scheduling Flows

Related code: `src/scheduling/` (config, slots, booking) · `src/appointments/entities/appointment.entity.ts` · migration `1753300000000-AddAdvancedSchedulingAndAppointments.ts`.

## Stream scheduling

```mermaid
flowchart TD
  A[Doctor sets STREAM config<br/>slotDuration + bufferTime] --> B[Day 4 availability checked<br/>custom override or recurring weekday]
  B --> C{Windows available?}
  C -->|No / isUnavailable| D[Return empty slots array]
  C -->|Yes| E[Generate sequential exact slots<br/>start→end with duration + buffer]
  E --> F[Patient GET /patient/appointments/slots]
  F --> G[Slots listed with isBooked flags]
  G --> H[Patient POST /patient/appointments/book<br/>exact startTime + endTime]
  H --> I{Valid free future slot?}
  I -->|No| J[400 Bad Request / 409 Conflict]
  I -->|Yes| K[Create STREAM appointment BOOKED]
```

## Wave scheduling

```mermaid
flowchart TD
  A[Doctor sets WAVE config<br/>maxCapacity] --> B[Day 4 availability checked<br/>resolve time window]
  B --> C{Window available?}
  C -->|No / isUnavailable| D[Return empty array]
  C -->|Yes| E[Expose one wave window<br/>bookedCount / availableCapacity]
  E --> F[Patient GET /patient/appointments/slots]
  F --> G[Patient POST /patient/appointments/book]
  G --> H[Begin DB transaction<br/>lock schedule config row]
  H --> I{bookedCount < maxCapacity?}
  I -->|No| J[409 Wave window is fully booked]
  I -->|Yes| K[Assign next tokenNumber atomically<br/>Token = max existing + 1]
  K --> L[Create WAVE appointment BOOKED]
  L --> M[Commit transaction]
```

## End-to-end sequence

```mermaid
sequenceDiagram
  participant D as Doctor
  participant API as Schedula API
  participant DB as PostgreSQL
  participant P as Patient

  D->>API: POST /doctor/schedule-config (STREAM|WAVE)
  API->>DB: Upsert doctor_schedule_configs
  D->>API: POST /doctor/availability (Day 4 windows)
  API->>DB: Save recurring/custom availability

  P->>API: GET /patient/appointments/slots?doctorId&date
  API->>DB: Load config + availability + bookings
  API-->>P: Stream slots or Wave capacity

  P->>API: POST /patient/appointments/book
  API->>DB: Validate + insert appointment
  API-->>P: Appointment (tokenNumber if WAVE)
```
