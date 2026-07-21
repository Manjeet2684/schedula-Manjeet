# Schedula — ER Diagram (Day 1)

Basic relational model derived from the Schedula wireframe flows (patient booking + doctor availability).

## Entity Relationship Diagram

```mermaid
erDiagram
    USER ||--o| PATIENT : "has profile"
    USER ||--o| DOCTOR : "has profile"
    USER ||--o{ NOTIFICATION : "receives"
    DOCTOR ||--o{ SPECIALTY_ASSIGNMENT : "has"
    SPECIALTY ||--o{ SPECIALTY_ASSIGNMENT : "assigned to"
    DOCTOR ||--o{ AVAILABILITY : "defines"
    DOCTOR ||--o{ SLOT : "owns"
    AVAILABILITY ||--o{ SLOT : "generates"
    PATIENT ||--o{ APPOINTMENT : "books"
    DOCTOR ||--o{ APPOINTMENT : "receives"
    SLOT ||--o| APPOINTMENT : "booked as"
    APPOINTMENT ||--o{ NOTIFICATION : "triggers"

    USER {
        uuid id PK
        string email UK
        string password_hash
        enum role "PATIENT | DOCTOR | ADMIN"
        string phone
        boolean is_active
        timestamp created_at
        timestamp updated_at
    }

    PATIENT {
        uuid id PK
        uuid user_id FK_UK
        string full_name
        date date_of_birth
        enum gender
        text address
        timestamp created_at
    }

    DOCTOR {
        uuid id PK
        uuid user_id FK_UK
        string full_name
        text bio
        string clinic_name
        text clinic_address
        int experience_years
        decimal consultation_fee
        boolean is_verified
        timestamp created_at
    }

    SPECIALTY {
        uuid id PK
        string name UK
        text description
    }

    SPECIALTY_ASSIGNMENT {
        uuid id PK
        uuid doctor_id FK
        uuid specialty_id FK
    }

    AVAILABILITY {
        uuid id PK
        uuid doctor_id FK
        int day_of_week "0-6"
        time start_time
        time end_time
        int slot_duration_minutes
        boolean is_active
    }

    SLOT {
        uuid id PK
        uuid doctor_id FK
        uuid availability_id FK
        timestamp start_at
        timestamp end_at
        enum status "AVAILABLE | BOOKED | BLOCKED"
    }

    APPOINTMENT {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        uuid slot_id FK_UK
        enum status "BOOKED | RESCHEDULED | CANCELLED | COMPLETED"
        text reason
        text notes
        timestamp booked_at
        timestamp cancelled_at
        timestamp created_at
        timestamp updated_at
    }

    NOTIFICATION {
        uuid id PK
        uuid user_id FK
        uuid appointment_id FK
        enum type "BOOKED | REMINDER | RESCHEDULED | CANCELLED"
        string title
        text message
        boolean is_read
        timestamp created_at
    }
```

## Relationships Summary

| From | To | Cardinality | Foreign key | Notes |
|------|----|-------------|-------------|-------|
| `USER` | `PATIENT` | 1 : 0..1 | `patient.user_id` | One user can have at most one patient profile |
| `USER` | `DOCTOR` | 1 : 0..1 | `doctor.user_id` | One user can have at most one doctor profile |
| `DOCTOR` | `SPECIALTY` | M : N | via `specialty_assignment` | Doctor may have multiple specialties |
| `DOCTOR` | `AVAILABILITY` | 1 : N | `availability.doctor_id` | Weekly working windows |
| `DOCTOR` | `SLOT` | 1 : N | `slot.doctor_id` | Concrete bookable time ranges |
| `AVAILABILITY` | `SLOT` | 1 : N | `slot.availability_id` | Slots derived from availability rules |
| `PATIENT` | `APPOINTMENT` | 1 : N | `appointment.patient_id` | Patient can book many appointments |
| `DOCTOR` | `APPOINTMENT` | 1 : N | `appointment.doctor_id` | Doctor receives many appointments |
| `SLOT` | `APPOINTMENT` | 1 : 0..1 | `appointment.slot_id` (unique) | A slot is booked by at most one appointment |
| `USER` | `NOTIFICATION` | 1 : N | `notification.user_id` | In-app / push notifications |
| `APPOINTMENT` | `NOTIFICATION` | 1 : N | `notification.appointment_id` | Status changes notify users |

## Design notes (for Day 1)

- Auth identity lives in `USER`; role-specific data is split into `PATIENT` / `DOCTOR` (1:1 with user).
- `SLOT.status` + unique `appointment.slot_id` prevent double-booking the same slot.
- Reschedule = cancel/link old appointment + create a new one on a free slot (or update `slot_id` + set status `RESCHEDULED`).
- `SPECIALTY` is optional but useful for “Find doctor” search from the wireframe.

## How to view / export

1. Open this file in GitHub, VS Code (Mermaid preview), or [mermaid.live](https://mermaid.live) and paste the diagram block.
2. Export PNG/SVG from mermaid.live for submission (or recreate the same schema in Draw.io / Eraser.io / Excalidraw / Lucidchart).
