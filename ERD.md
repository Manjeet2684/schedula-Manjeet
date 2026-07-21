# Schedula ER Diagram

```mermaid
erDiagram
    USERS ||--o| DOCTORS : "has profile"
    USERS ||--o{ PATIENTS : "manages"
    DOCTORS ||--o{ SLOTS : "owns"
    PATIENTS ||--o{ APPOINTMENTS : "books"
    DOCTORS ||--o{ APPOINTMENTS : "receives"
    SLOTS ||--o| APPOINTMENTS : "booked as"
    USERS ||--o{ NOTIFICATIONS : "receives"
    APPOINTMENTS ||--o{ NOTIFICATIONS : "triggers"

    USERS {
        uuid id PK
        string email UK
        string password
        enum role "DOCTOR | PATIENT"
        string fullName
        timestamp createdAt
        timestamp updatedAt
    }

    DOCTORS {
        uuid id PK
        uuid user_id FK_UK
        string fullName
        string specialization
        int experienceYears
    }

    PATIENTS {
        uuid id PK
        uuid user_id FK
        string fullName
        int age
        string gender
    }

    SLOTS {
        uuid id PK
        uuid doctor_id FK
        timestamp startAt
        timestamp endAt
        enum status "AVAILABLE | BOOKED | BLOCKED"
    }

    APPOINTMENTS {
        uuid id PK
        uuid patient_id FK
        uuid doctor_id FK
        uuid slot_id FK_UK
        enum status "BOOKED | CANCELLED | COMPLETED"
        timestamp createdAt
    }

    NOTIFICATIONS {
        uuid id PK
        uuid user_id FK
        uuid appointment_id FK
        string title
        text message
        boolean isRead
        timestamp createdAt
    }
```

## Relationships

| From | To | Type | Notes |
|------|----|------|--------|
| USERS → DOCTORS | 1:0..1 | Doctor profile for `role=DOCTOR` |
| USERS → PATIENTS | 1:N | Supports family/friends under one account |
| DOCTORS → SLOTS | 1:N | Doctor availability windows |
| PATIENTS → APPOINTMENTS | 1:N | Patient bookings |
| DOCTORS → APPOINTMENTS | 1:N | Doctor schedule |
| SLOTS → APPOINTMENTS | 1:0..1 | One slot max one appointment |
| USERS → NOTIFICATIONS | 1:N | Alerts for booking changes |
