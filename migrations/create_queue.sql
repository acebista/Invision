-- Create a table to track background processing of invoices
CREATE TABLE IF NOT EXISTS processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id),
    file_path TEXT NOT NULL, -- Path in Supabase Storage
    status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    attempts INT DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (and disable for dev as per previous instruction, but let's keep it clean)
ALTER TABLE processing_queue ENABLE ROW LEVEL SECURITY;
-- For dev, we disabled all, so let's disable this one too for consistency
ALTER TABLE processing_queue DISABLE ROW LEVEL SECURITY;

-- Enable pg_net for webhooks
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Triggers to handle updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_processing_queue_updated_at
    BEFORE UPDATE ON processing_queue
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
