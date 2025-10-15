// netlify/functions/ts-proxy.js
const TS_URL = "https://api.tripleseat.com/v1/leads/create.js?lead_form_id=44948&public_key=b5c6a2f2358a55bfd720875530a3bcc44d2ec74d";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST only" }) };
  }
  try {
    // We expect URL-encoded form data coming from the page
    const body = event.body || "";

    const tsRes = await fetch(TS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });

    const result = await tsRes.json();

    if (result.success_message) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, message: result.success_message, lead_id: result.lead_id || null })
      };
    } else {
      return {
        statusCode: 422,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: false, errors: result.errors || { base: ["Unknown error"] } })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, errors: { base: [String(err)] } })
    };
  }
};
