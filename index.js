export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // ROUTE 1: Grok Proxy (Protects your API Key)
    if (url.pathname === "/grok" && request.method === "POST") {
      const body = await request.json();
      const response = await fetch("https://x.ai", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json", 
          "Authorization": `Bearer ${env.GROK_API_KEY}` // Stored in Cloudflare Secrets
        },
        body: JSON.stringify(body)
      });
      return new Response(response.body, { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // ROUTE 2: Iframe Bypass (Strips security headers)
    if (targetUrl) {
      let response = await fetch(targetUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      let newHeaders = new Headers(response.headers);
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.set("Access-Control-Allow-Origin", "*");
      return new Response(response.body, { headers: newHeaders });
    }

    return new Response("Invalid Request", { status: 400 });
  }
};
