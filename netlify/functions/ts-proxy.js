const https = require("https");
const { URL } = require("url");

const TS_URL = "https://api.tripleseat.com/v1/leads/create.js?lead_form_id=44948&public_key=b5c6a2f358a55bfd720875530a3bcc44d2ec7d4";

function postUrlEncoded(targetUrl, params) {
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const data = new URLSearchParams(params).toString();
    const options = {
      method: "POST",
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "POST only" };
  }

  try {
    const params = new URLSearchParams(event.body);

    // Build the address block for appending to description
    const address = params.get("lead[address1]") || "";
    const city = params.get("lead[city]") || "";
    const state = params.get("lead[state]") || "";
    const zip = params.get("lead[zip_code]") || "";

    let desc = params.get("lead[event_description]") || "";
    const addressBlock = `\n\nAddress:\n${address}\n${city}, ${state} ${zip}`;
    desc += addressBlock;

    params.set("lead[event_description]", desc);

    // Send to TripleSeat
    const response = await postUrlEncoded(TS_URL, params);
    return { statusCode: 200, body: response.body };
  } catch (err) {
    return { statusCode: 500, body: `Error: ${err.message}` };
  }
};
