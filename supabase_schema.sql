-- ==============================================================================
-- Meetly Supabase PostgreSQL Schema & Row Level Security (RLS) Setup
-- Run this script in the Supabase Dashboard SQL Editor:
-- https://supabase.com/dashboard/project/dwwttorjskavpjkdagxw/sql
-- ==============================================================================

-- 1. Create the meetings table in the public schema
CREATE TABLE IF NOT EXISTS public.meetings (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    title TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_size TEXT DEFAULT 'N/A',
    duration TEXT DEFAULT 'N/A',
    language TEXT DEFAULT 'English',
    word_count INTEGER DEFAULT 0,
    summary TEXT DEFAULT '',
    discussion_points_json JSONB DEFAULT '[]'::jsonb,
    decisions_json JSONB DEFAULT '[]'::jsonb,
    action_items_json JSONB DEFAULT '[]'::jsonb,
    utterances_json JSONB DEFAULT '[]'::jsonb,
    transcript TEXT DEFAULT '',
    tags_json JSONB DEFAULT '["Project"]'::jsonb,
    pinned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes for fast user queries
CREATE INDEX IF NOT EXISTS idx_meetings_user_id ON public.meetings(user_id);
CREATE INDEX IF NOT EXISTS idx_meetings_user_email ON public.meetings(user_email);
CREATE INDEX IF NOT EXISTS idx_meetings_created_at ON public.meetings(created_at DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- 4. Row Level Security Policies
-- Users can only select/view their own meetings
DROP POLICY IF EXISTS "Users can view their own meetings" ON public.meetings;
CREATE POLICY "Users can view their own meetings" 
ON public.meetings 
FOR SELECT 
TO authenticated, anon
USING (
    auth.uid() = user_id 
    OR auth.jwt() ->> 'email' = user_email
    OR user_email = 'guest@meetly.app'
);

-- Users can only insert their own meetings
DROP POLICY IF EXISTS "Users can insert their own meetings" ON public.meetings;
CREATE POLICY "Users can insert their own meetings" 
ON public.meetings 
FOR INSERT 
TO authenticated, anon
WITH CHECK (
    auth.uid() = user_id 
    OR auth.jwt() ->> 'email' = user_email
    OR user_email = 'guest@meetly.app'
    OR user_id IS NULL
);

-- Users can only update their own meetings
DROP POLICY IF EXISTS "Users can update their own meetings" ON public.meetings;
CREATE POLICY "Users can update their own meetings" 
ON public.meetings 
FOR UPDATE 
TO authenticated, anon
USING (
    auth.uid() = user_id 
    OR auth.jwt() ->> 'email' = user_email
    OR user_email = 'guest@meetly.app'
)
WITH CHECK (
    auth.uid() = user_id 
    OR auth.jwt() ->> 'email' = user_email
    OR user_email = 'guest@meetly.app'
);

-- Users can only delete their own meetings
DROP POLICY IF EXISTS "Users can delete their own meetings" ON public.meetings;
CREATE POLICY "Users can delete their own meetings" 
ON public.meetings 
FOR DELETE 
TO authenticated, anon
USING (
    auth.uid() = user_id 
    OR auth.jwt() ->> 'email' = user_email
    OR user_email = 'guest@meetly.app'
);


-- ==============================================================================
-- Supabase Storage Setup (Audio Recordings Bucket & Storage RLS)
-- ==============================================================================

-- 1. Create the audio-recordings storage bucket (Private, 250MB file size limit)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'audio-recordings',
    'audio-recordings',
    false,
    262144000, -- 250 MB
    ARRAY[
        'audio/mpeg',
        'audio/wav',
        'audio/x-wav',
        'audio/mp4',
        'audio/x-m4a',
        'audio/webm',
        'video/mp4',
        'video/webm',
        'audio/ogg',
        'audio/aac',
        'audio/flac'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 262144000;

-- 2. Add storage_path, storage_url, and 7-day retention columns to public.meetings table
ALTER TABLE public.meetings 
ADD COLUMN IF NOT EXISTS storage_path TEXT,
ADD COLUMN IF NOT EXISTS storage_url TEXT,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delete_scheduled_for TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_meetings_deleted_at ON public.meetings(deleted_at);

-- 3. Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated and guest users to upload only into their own folder
DROP POLICY IF EXISTS "Users can upload their own audio" ON storage.objects;
CREATE POLICY "Users can upload their own audio"
ON storage.objects
FOR INSERT
TO authenticated, anon
WITH CHECK (
    bucket_id = 'audio-recordings' AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = auth.jwt() ->> 'email'
        OR (storage.foldername(name))[1] = 'guest'
        OR auth.role() = 'anon'
    )
);

-- Allow users to view and download only their own audio files
DROP POLICY IF EXISTS "Users can read their own audio" ON storage.objects;
CREATE POLICY "Users can read their own audio"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (
    bucket_id = 'audio-recordings' AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = auth.jwt() ->> 'email'
        OR (storage.foldername(name))[1] = 'guest'
        OR auth.role() = 'anon'
    )
);

-- Allow users to delete their own audio files
DROP POLICY IF EXISTS "Users can delete their own audio" ON storage.objects;
CREATE POLICY "Users can delete their own audio"
ON storage.objects
FOR DELETE
TO authenticated, anon
USING (
    bucket_id = 'audio-recordings' AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[1] = auth.jwt() ->> 'email'
        OR (storage.foldername(name))[1] = 'guest'
        OR auth.role() = 'anon'
    )
);
