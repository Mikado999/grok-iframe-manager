const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Handle Preflight OPTIONS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. ROUTE: /grok (API Proxy)
    if (url.pathname === "/grok" && request.method === "POST") {
      const response = await fetch("https://x.ai", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROK_API_KEY}`
        },
        body: await request.text()
      });
      return new Response(response.body, { headers: corsHeaders });
    }

    // 3. ROUTE: / (Serve Frontend)
    if (url.pathname === "/" && !url.searchParams.has("url")) {
      return new Response(getHTML(), {
        headers: { "Content-Type": "text/html", ...corsHeaders }
      });
    }

    // 4. ROUTE: Iframe Bypass (via ?url=)
    const targetUrl = url.searchParams.get("url");
    if (targetUrl) {
      const siteUrl = new URL(targetUrl);
      const response = await fetch(targetUrl, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });

      // Fix relative URLs (src, href) using HTMLRewriter
      const rewriter = new HTMLRewriter()
        .on("img", new AttributeRewriter("src", siteUrl.origin))
        .on("link", new AttributeRewriter("href", siteUrl.origin))
        .on("script", new AttributeRewriter("src", siteUrl.origin))
        .on("a", new AttributeRewriter("href", siteUrl.origin));

      const modifiedResponse = rewriter.transform(response);
      const newHeaders = new Headers(modifiedResponse.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");

      return new Response(modifiedResponse.body, { headers: newHeaders });
    }

    return new Response("Not Found", { status: 404 });
  }
};

// Helper to fix relative paths
class AttributeRewriter {
  constructor(attr, base) { this.attr = attr; this.base = base; }
  element(el) {
    const val = el.getAttribute(this.attr);
    if (val && val.startsWith("/")) el.setAttribute(this.attr, this.base + val);
  }
}

// Frontend HTML Template
function getHTML() {
  return `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8"><title>Grok Hub</title>
    <script src="https://tailwindcss.com"></script>
  </head>
  <body class="bg-black text-white flex h-screen">
    <aside class="w-80 border-r border-gray-800 p-4 flex flex-col">
      <div id="chat" class="flex-grow overflow-y-auto text-sm space-y-2 mb-4"></div>
      <input id="in" class="w-full bg-gray-900 p-2 rounded border border-gray-700" placeholder="Open Wikipedia...">
    </aside>
    <main id="grid" class="flex-grow p-4 grid grid-cols-2 gap-4 overflow-y-auto"></main>
    <script>
      const input = document.getElementById('in');
      const chat = document.getElementById('chat');
      const grid = document.getElementById('grid');

      input.addEventListener('keypress', async (e) => {
        if (e.key !== 'Enter') return;
        const msg = input.value; input.value = '';
        chat.innerHTML += '<div class="text-blue-400">You: ' + msg + '</div>';

        const res = await fetch('/grok', {
          method: 'POST',
          body: JSON.stringify({
            model: "grok-beta",
            messages: [{ role: "user", content: msg }],
            tools: [{
              type: "function",
              function: {
                name: "manage_iframe",
                description: "Open/close site iframes",
                parameters: {
                  type: "object",
                  properties: {
                    action: { type: "string", enum: ["open", "close"] },
                    url: { type: "string" },
                    id: { type: "string" }
                  },
                  required: ["action", "id"]
                }
              }
            }]
          })
        });
        
        const data = await res.json();
        const call = data.choices[0].message.tool_calls?.[0];
        if (call) {
          const { action, url, id } = JSON.parse(call.function.arguments);
          if (action === 'open') {
            const div = document.createElement('div');
            div.id = 'f-' + id;
            div.className = "h-[400px] border border-gray-700 rounded overflow-hidden flex flex-col";
            div.innerHTML = '<div class="bg-gray-800 p-1 text-[10px]">' + id + '</div>' + 
                            '<iframe src="/?url=' + encodeURIComponent(url) + '" class="flex-grow w-full border-none bg-white"></iframe>';
            grid.appendChild(div);
          } else {
            document.getElementById('f-' + id)?.remove();
          }
        }
      });
    </script>
  </body>
  </html>`;
}
