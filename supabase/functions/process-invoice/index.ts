import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Parse Webhook Payload (from pg_net or direct call)
        // Expecting { record: { id, file_path, workspace_id, ... } } if triggered by DB trigger
        // or just { id, file_path, ... } if called directly.
        const payload = await req.json()
        const task = payload.record || payload

        if (!task || !task.file_path || !task.workspace_id) {
            throw new Error('Invalid payload: missing file_path or workspace_id')
        }

        console.log(`Processing task ${task.id}: ${task.file_path}`)

        // 1. Download Image from Storage
        const { data: fileData, error: downloadError } = await supabaseClient
            .storage
            .from('invoice_uploads')
            .download(task.file_path)

        if (downloadError) throw downloadError

        // Convert to Base64
        const arrayBuffer = await fileData.arrayBuffer()
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
        const mimeType = fileData.type || 'image/jpeg'
        const dataUrl = `data:${mimeType};base64,${base64}`

        // 2. Call OpenRouter (Qwen)
        // Note: We duplicate the prompt logic here for robustness in the cloud
        const apiKey = Deno.env.get('OPENROUTER_API_KEY')
        if (!apiKey) throw new Error('OPENROUTER_API_KEY not set')

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "qwen/qwen2.5-vl-72b-instruct",
                messages: [
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `Extract invoice data from this image. Output ONLY valid JSON with this structure:
                {
                    "vendor_name": "string or null",
                    "invoice_number": "string or null",
                    "invoice_date_raw": "string or null",
                    "taxable_amount": number (0 if missing),
                    "vat_amount": number (0 if missing),
                    "grand_total": number (0 if missing),
                    "currency": "NPR",
                    "line_items": [{"description": string, "quantity": number, "unit_price": number, "amount": number}],
                    "other_charges": [{"name": string, "amount": number}]
                }
                If values are missing, use null or 0.
                Handle Nepali Devanagari numerals by converting to English numerals.`
                            },
                            {
                                type: "image_url",
                                image_url: { url: dataUrl }
                            }
                        ]
                    }
                ]
            })
        })

        if (!response.ok) {
            const err = await response.text()
            throw new Error(`OpenRouter API Error: ${err}`)
        }

        const aiData = await response.json()
        let rawContent = aiData.choices[0].message.content
        // Clean code blocks
        rawContent = rawContent.replace(/```json/g, '').replace(/```/g, '').trim()
        const extracted = JSON.parse(rawContent)

        // 3. Validation Logic (Simple)
        const taxable = extracted.taxable_amount || 0
        const vat = extracted.vat_amount || 0
        const total = extracted.grand_total || 0
        const otherChargesTotal = (extracted.other_charges || []).reduce((sum: number, c: any) => sum + c.amount, 0)

        const isMathMismatch = Math.abs((taxable + vat + otherChargesTotal) - total) > 1.0
        const isVatInconsistent = Math.abs(vat - (taxable * 0.13)) > (taxable * 0.01)
        const isMissingFields = !extracted.invoice_number || !extracted.vendor_name

        // 4. Save to Database
        const { error: insertError } = await supabaseClient
            .from('invoices')
            .insert({
                workspace_id: task.workspace_id,
                vendor_name_en: extracted.vendor_name,
                invoice_number_en: extracted.invoice_number,
                invoice_date_raw: extracted.invoice_date_raw,
                taxable_amount: taxable,
                vat_amount: vat,
                other_charges: extracted.other_charges,
                grand_total: total,
                currency: extracted.currency || 'NPR',
                line_items: extracted.line_items,
                invoice_flags: [{
                    math_mismatch: isMathMismatch,
                    vat_inconsistent: isVatInconsistent,
                    missing_fields: isMissingFields
                }],
                status: (isMathMismatch || isVatInconsistent || isMissingFields) ? 'pending_review' : 'approved',
                image_urls: [task.file_path], // Store path or public URL
                review_status: 'pending' // Legacy field support
            })

        if (insertError) throw insertError

        // 5. Update Queue Status
        await supabaseClient
            .from('processing_queue')
            .update({ status: 'completed' })
            .eq('id', task.id)

        return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('Processing Error:', error)

        // Attempt to update queue with error
        try {
            const supabaseClient = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )
            const payload = await req.json().catch(() => ({}))
            const task = payload.record || payload
            if (task && task.id) {
                await supabaseClient
                    .from('processing_queue')
                    .update({
                        status: 'failed',
                        error_message: error instanceof Error ? error.message : String(error)
                    })
                    .eq('id', task.id)
            }
        } catch (_) { /* ignore */ }

        return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
