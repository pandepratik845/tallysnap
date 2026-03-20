export const config = { runtime: "edge" };

export default async function handler(req) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { imageBase64, mimeType } = body;

    if (!imageBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "Missing imageBase64 or mimeType" }), { status: 400, headers: corsHeaders });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "API key not configured on server" }), { status: 500, headers: corsHeaders });
    }

    const prompt = `You are an expert Indian accounting assistant trained in Tally ERP data entry.
Analyze this invoice/bill/challan image and extract ALL data for a Tally voucher entry.
Return ONLY a valid JSON object — no markdown, no backticks, no explanation.

Use exactly this structure:
{"voucher_type":"Purchase","voucher_no":"","date":"DD-MM-YYYY","party_name":"","party_gstin":"","place_of_supply":"","ledger_account":"Purchase Account","narration":"","items":[{"sr":1,"description":"","hsn":"","qty":1,"unit":"Nos","rate":0.00,"discount":0.00,"amount":0.00,"gst_percent":18,"gst_amount":0.00}],"subtotal":0.00,"total_gst":0.00,"grand_total":0.00,"cgst":0.00,"sgst":0.00,"igst":0.00,"additional_notes":""}

Rules:
- Extract EVERY line item separately
- If CGST+SGST shown, fill cgst and sgst. If only IGST, fill igst.
- For missing fields use "" or 0
- Date must be DD-MM-YYYY
- Return ONLY the JSON`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: imageBase64 } }, { text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: "Gemini API error: " + errText }), { status: 502, headers: corsHeaders });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch { return new Response(JSON.stringify({ error: "Could not parse response", raw: rawText }), { status: 422, headers: corsHeaders }); }

    return new Response(JSON.stringify({ success: true, data: parsed }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Server error: " + err.message }), { status: 500, headers: corsHeaders });
  }
}
