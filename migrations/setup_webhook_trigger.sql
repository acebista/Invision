-- Enable pg_net if not already
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Function to call Edge Function
CREATE OR REPLACE FUNCTION process_invoice_webhook()
RETURNS TRIGGER AS $$
DECLARE
    project_url TEXT := 'https://vzwxvjeuzayvkceoybve.supabase.co';
    function_name TEXT := 'process-invoice';
    -- REPLACE THIS WITH YOUR SERVICE ROLE KEY or ANON KEY (if function is public)
    auth_header TEXT := 'Bearer YOUR_SERVICE_ROLE_KEY'; 
BEGIN
    -- Only trigger if status is 'pending'
    IF NEW.status = 'pending' THEN
        PERFORM net.http_post(
            url := project_url || '/functions/v1/' || function_name,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', auth_header
            ),
            body := jsonb_build_object('record', row_to_json(NEW))
        );
        
        -- Optional: Update status to 'processing' to avoid duplicate calls if logic permitted
        -- But here we are in an AFTER INSERT trigger, so we can't update NEW.
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger
DROP TRIGGER IF EXISTS trigger_process_invoice ON processing_queue;

CREATE TRIGGER trigger_process_invoice
    AFTER INSERT ON processing_queue
    FOR EACH ROW
    EXECUTE FUNCTION process_invoice_webhook();
