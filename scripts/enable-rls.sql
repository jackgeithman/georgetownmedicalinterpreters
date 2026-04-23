-- Enable Row Level Security on all public tables
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/tosxvyspbdwxajkcduqs/sql/new
--
-- This ONLY affects Supabase's PostgREST REST API.
-- Prisma (used by the app) connects directly as postgres superuser and
-- bypasses RLS entirely — so this will NOT break anything in the app.
--
-- With RLS enabled and no policies, the REST API returns nothing.
-- The app continues to work 100% normally.

ALTER TABLE "User"                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Account"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VerificationToken"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Clinic"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerProfile"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClearanceLog"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Shift"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShiftPosition"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailRule"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Feedback"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Suggestion"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "VolunteerNotifPrefs"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotifLog"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClinicNotifPrefs"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LanguageConfig"       ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TrainingMaterial"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityLog"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AdminNote"            ENABLE ROW LEVEL SECURITY;
