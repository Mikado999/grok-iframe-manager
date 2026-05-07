const corsHeaders = {
  "Access-Control-Allow-Origin": "*", // Or specific domain like https://pages.dev
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // 1. Handle Preflight OPTIONS requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Grok API Proxy
    if (url.pathname === "/grok" && request.method === "POST") {
      try {
        const body = await request.json();
        const response = await fetch("https://x.ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${env.GROK_API_KEY}`
          },
          body: JSON.stringify(body)
        });
        
        const data = await response.text();
        return new Response(data, { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { 
          status: 500, 
          headers: corsHeaders 
        });
      }
    }

    // 3. Iframe Bypass + URL Rewriter
    if (targetUrl) {
      const siteUrl = new URL(targetUrl);
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      const rewriter = new HTMLRewriter()
        .on("img", new AttributeRewriter("src", siteUrl.origin))
        .on("link", new AttributeRewriter("href", siteUrl.origin))
        .on("script", new AttributeRewriter("src", siteUrl.origin));

      const modifiedResponse = rewriter.transform(response);
      const newHeaders = new Headers(modifiedResponse.headers);
      
      // Inject CORS headers into the site's original headers
      Object.keys(corsHeaders).forEach(key => newHeaders.set(key, corsHeaders[key]));
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");

      return new Response(modifiedResponse.body, { headers: newHeaders });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
};

class AttributeRewriter {
  constructor(attributeName, base) {
    this.attributeName = attributeName;
    this.base = base;
  }
  element(element) {
    const attribute = element.getAttribute(this.attributeName);
    if (attribute && attribute.startsWith("/")) {
      element.setAttribute(this.attributeName, this.base + attribute);
    }
  }
}
