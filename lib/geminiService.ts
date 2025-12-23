interface LineItem {
    description: string;
    quantity: number | null;
    unit_price: number | null;
    amount: number | null;
}

interface OtherCharge {
    name: string;
    amount: number;
}

interface ExtractedInvoiceData {
    vendor_name: string | null;
    invoice_number: string | null;
    invoice_date_raw: string | null;
    taxable_amount: number | null;
    vat_amount: number | null;
    grand_total: number | null;
    currency: string;
    line_items: any[];
    other_charges: OtherCharge[];
}

const EXTRACTION_PROMPT = `You are an expert auditor specialized in extracting data from South Asian invoices, specifically from Nepal.

Extract the following fields from the invoice image and return them as JSON:
- vendor_name: The name of the vendor/restaurant/business
- invoice_number: The invoice/bill number
- invoice_date_raw: The date as written
- taxable_amount: The subtotal before tax (look for "Sub Total" or similar)
- vat_amount: The VAT/tax amount (usually 13%)
- other_charges: Array of additional charges found BETWEEN subtotal and grand total.
  Examples: "Service Charge" (10%), "Freight", "Transportation", "Discount" (negative amount).
  Format: [{ "name": "Service Charge", "amount": 185 }]
- grand_total: The final total amount
- currency: Usually NPR or Rs.
- line_items: Array of items purchased (description, quantity, unit_price, amount)

Important:
1. Convert Nepali numerals (०-९) to Arabic (0-9)
2. Extract only numeric values for amounts
3. Be careful: In Nepal, Service Charge (10%) is usually added to Subtotal to make Taxable Amount, OR Taxable Amount is Subtotal + Service Charge. 
   - If you see "Service Charge", extract it as an "other_charge".
   - "Taxable Amount" usually implies the amount on which VAT is calculated.
4. Return ONLY valid JSON, no markdown.

Example response:
{
    "vendor_name": "Hotel Crown Plaza",
    "invoice_number": "266",
    "invoice_date_raw": "2081-08-15",
    "taxable_amount": 1850,
    "other_charges": [
        { "name": "Service Charge (10%)", "amount": 185 }
    ],
    "vat_amount": 264.55,
    "grand_total": 2299.55,
    "currency": "NPR",
    "line_items": []
}`;

// Use Gemini Vision API (primary)
async function extractWithGemini(base64Data: string): Promise<ExtractedInvoiceData> {
    const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY not set');

    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: EXTRACTION_PROMPT },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: base64Data
                            }
                        }
                    ]
                }],
                generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2048
                }
            })
        }
    );

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('No content in Gemini response');

    // Clean markdown code blocks if present
    let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return parseExtractedData(JSON.parse(cleaned));
}

// Use OpenRouter (fallback)
async function extractWithOpenRouter(base64Data: string): Promise<ExtractedInvoiceData> {
    const apiKey = process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': typeof window !== 'undefined' ? window.location.href : 'https://invoicevision.app',
            'X-Title': 'InvoiceVision'
        },
        body: JSON.stringify({
            model: 'google/gemini-2.0-flash-001',  // Use Gemini via OpenRouter as fallback
            messages: [{
                role: 'user',
                content: [
                    { type: 'text', text: EXTRACTION_PROMPT },
                    { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                ]
            }],
            temperature: 0.1,
            max_tokens: 2048
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('No content in OpenRouter response');

    let cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return parseExtractedData(JSON.parse(cleaned));
}

function parseExtractedData(extracted: any): ExtractedInvoiceData {
    return {
        vendor_name: extracted.vendor_name || null,
        invoice_number: extracted.invoice_number ? String(extracted.invoice_number) : null,
        invoice_date_raw: extracted.invoice_date_raw || null,
        taxable_amount: extracted.taxable_amount ? Number(extracted.taxable_amount) : null,
        vat_amount: extracted.vat_amount ? Number(extracted.vat_amount) : null,
        grand_total: extracted.grand_total ? Number(extracted.grand_total) : null,
        currency: extracted.currency || 'NPR',
        line_items: Array.isArray(extracted.line_items) ? extracted.line_items : [],
        other_charges: Array.isArray(extracted.other_charges) ? extracted.other_charges : []
    };
}

export async function extractInvoiceData(imageBase64: string): Promise<ExtractedInvoiceData> {
    // Clean the base64 string
    const base64Data = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;

    // Try Gemini first (more reliable)
    try {
        console.log('Attempting extraction with Gemini...');
        return await extractWithGemini(base64Data);
    } catch (geminiError) {
        console.warn('Gemini failed, trying OpenRouter fallback:', geminiError);

        // Fallback to OpenRouter
        try {
            return await extractWithOpenRouter(base64Data);
        } catch (openRouterError) {
            console.error('Both APIs failed:', { geminiError, openRouterError });
            throw new Error(`Failed to extract invoice data. Gemini: ${geminiError}. OpenRouter: ${openRouterError}`);
        }
    }
}
