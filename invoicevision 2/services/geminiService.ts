
import { GoogleGenAI, Type } from "@google/genai";

const API_KEY = process.env.API_KEY || "";

export async function extractInvoiceData(imageBase64: string) {
  if (!API_KEY) {
    throw new Error("API Key not found");
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  const systemInstruction = `
    You are an expert auditor specialized in South Asian invoices, specifically from Nepal.
    Extract the following fields from the provided invoice image.
    The invoice may be handwritten or typed in English or Nepali.
    Extract ONLY the header fields. Do not extract line items.
    Return JSON format only. If a field is uncertain, return null.
    Convert Nepali numerals (०,१,२,३,४,५,६,७,८,९) to Arabic numerals (0,1,2,3,4,5,6,7,8,9).
    Fields: vendor_name, invoice_number, invoice_date_raw, taxable_amount, vat_amount, grand_total, currency.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: systemInstruction },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageBase64.split(',')[1] || imageBase64
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            vendor_name: { type: Type.STRING },
            invoice_number: { type: Type.STRING },
            invoice_date_raw: { type: Type.STRING },
            taxable_amount: { type: Type.NUMBER },
            vat_amount: { type: Type.NUMBER },
            grand_total: { type: Type.NUMBER },
            currency: { type: Type.STRING }
          }
        }
      }
    });

    const result = JSON.parse(response.text || "{}");
    return result;
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
}
