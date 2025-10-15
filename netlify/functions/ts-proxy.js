// netlify/functions/ts-proxy.js
const https = require("https");
const { URL } = require("url");

const TS_URL = "https://api.tripleseat.com/v1/leads/create.js?lead_form_id=44948&public_key=b5c6a2f2358a55bfd720875530a3bcc44d2ec74d";

function postUrlEncoded(targetUrl, bodyStr) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const options = {
      method: "POST",
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(bodyStr)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });

    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "POST only" }) };
  }

  try {
    // Parse the incoming form body
    const params = new URLSearchParams(event.body || "");

    // Grab existing description (if any)
    const currentDesc = params.get("lead[event_description]") || "";

    // Collect address bits
    const addr1 = (params.get("lead[address1]") || "").trim();
    const city  = (params.get("lead[city]") || "").trim();
    const state = (params.get("lead[state]") || "").trim();
    const zip   = (params.get("lead[zip_code]") || "").trim();

    // If user typed any address, append a nicely formatted block into description
    if (addr1 || city || state || zip) {
      const addressBlock = [
        "----- Address -----",
        addr1 ? `Street: ${addr1}` : null,
        city || state || zip ? `City/State/ZIP: ${[city, state, zip].filter(Boolean).join(" ")}` : null,
        "-------------------"
      ].filter(Boolean).join("\n");

      const combined = currentDesc
        ? `${currentDesc}\n\n${addressBlock}`
        : addressBlock;

      params.set("lead[event_description]", combined);
    }

    // Forward to TripleSeat
    const ts = await postUrlEncoded(TS_URL, params.toString());

    // TripleSeat responds with JSON
    return {
      statusCode: ts.status,
      headers: { "Content-Type": "application/json" },
      body: ts.body
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, errors: { base: [String(err)] } })
    };
  }
};
