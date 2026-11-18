# Final Phase Checklist (To Implement at Merging Time)

This document tracks features scheduled for implementation during the final integration phase:

## 1. SQLite Database Integration (`meetings.db`)
* **User Accounts:**
  - Table to store user profiles (ID, Name, Email, Creation Date).
  - Handles both standard registrations and Google accounts.
* **Meeting Recordings & Minutes History:**
  - Table to store processed meetings (Audio filename, Duration, Word count, Full transcript).
  - Stores extracted intelligence (Executive summary, Discussion points, Decisions, Action items).
  - Enables a "Past Meetings" history list on the user dashboard so previous minutes can be revisited and re-exported at any time.

## 2. Google OAuth Integration
* Free Google OAuth 2.0 client setup via Google Cloud Console.
* Connecting the existing "Continue with Google" button to real Google account sign-in.
