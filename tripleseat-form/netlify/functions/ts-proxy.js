<script>
(function(){
  const form = document.getElementById('leadForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = new FormData(form);
    form.innerHTML = "<p>Sending your request...</p>";

    const res = await fetch("/.netlify/functions/ts-proxy", {
      method: "POST",
      body: data
    });

    const json = await res.json();

    if (json.ok) {
      form.outerHTML = `
        <div style="text-align:center;max-width:600px;margin:40px auto">
          <img src="Cube_Logo_Final_Small.png" alt="The Cube" style="height:80px;display:block;margin:0 auto 16px;">
          <h2 style="color:#004b7c;">Thanks for reaching out!</h2>
          <p>Your request was submitted successfully. We’ll be in touch within 48 hours.</p>
        </div>`;
    } else {
      const list = Object.entries(json.errors || {}).map(([f,m]) => `<li><strong>${f}</strong>: ${m.join(", ")}</li>`).join("");
      form.outerHTML = `
        <div style="max-width:600px;margin:40px auto">
          <h2 style="color:#b00020;">We couldn’t submit your request</h2>
          <ul>${list}</ul>
          <p><a href="" onclick="location.reload();return false;">Try again</a></p>
        </div>`;
    }
  });
})();
</script>
