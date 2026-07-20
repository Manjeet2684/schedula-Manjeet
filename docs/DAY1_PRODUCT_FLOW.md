# Schedula — Product Flow (Wireframe Review)

Based on the Schedula project wireframe and Day 1 brief.

## Patient Flow

1. **Registration / Login** — Patient creates an account (or logs in) and lands on the patient home/dashboard.
2. **Find doctor** — Patient browses/searches doctors by specialty, name, location, or availability.
3. **Book appointment** — Patient picks a doctor, chooses an available time slot, and confirms the booking.
4. **Reschedule / Cancel** — Patient can move an upcoming appointment to another free slot, or cancel it.
5. **Notifications** — Patient receives alerts for booking confirmation, reminders, reschedule, and cancellation.

## Doctor Flow

1. **Registration** — Doctor signs up (role = doctor) and authenticates.
2. **Profile setup** — Doctor completes profile: specialty, experience, clinic/location, bio, consultation fee, etc.
3. **Availability management** — Doctor defines working days/hours; the system exposes bookable slots.
4. **Appointment handling** — Doctor views upcoming appointments and can confirm, complete, or cancel as needed.

## High-level System Flow

```text
Patient                    System                         Doctor
   |                         |                              |
   |-- Register/Login ------>|                              |
   |                         |<----- Register/Login --------|
   |                         |<----- Setup profile ---------|
   |                         |<----- Set availability ------|
   |-- Find doctors -------->|                              |
   |-- Select slot --------->|                              |
   |-- Book appointment ---->|-- Notify doctor ------------>|
   |<-- Confirmation --------|                              |
   |-- Reschedule/Cancel --->|-- Update + notify ---------->|
   |<-- Notifications -------|<----- Handle appointment ----|
```
