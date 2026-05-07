export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get("url");

    // Handling CORS for preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // ROUTE 1: Grok API Proxy
    if (url.pathname === "/grok" && request.method === "POST") {
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
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
      });
    }

    // ROUTE 2: Iframe Bypass + URL Rewriter
    if (targetUrl) {
      const siteUrl = new URL(targetUrl);
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0" }
      });

      // Prepare Rewriter to fix relative paths (src and href)
      const rewriter = new HTMLRewriter()
        .on("img", new AttributeRewriter("src", siteUrl.origin))
        .on("link", new AttributeRewriter("href", siteUrl.origin))
        .on("script", new AttributeRewriter("src", siteUrl.origin))
        .on("a", new AttributeRewriter("href", siteUrl.origin));

      const modifiedResponse = rewriter.transform(response);
      const newHeaders = new Headers(modifiedResponse.headers);
      
      // Strip security headers that block iframing
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(modifiedResponse.body, { headers: newHeaders });
    }

    return new Response("Not Found", { status: 404 });
  }
};

// Class to rewrite relative URLs into absolute ones
class AttributeRewriter {
  constructor(attributeName, base) {
    this.attributeName = attributeName;
    this.base = base;
  }
  element(element) {
    const attribute = element.getAttribute(this.attributeName);
    if (attribute && attribute.startsWith("/")) {
      // If it starts with / like "/style.css", turn it into "https://site.com"
      element.setAttribute(this.attributeName, this.base + attribute);
    }
  }
}
