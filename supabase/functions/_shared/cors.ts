/**
 * CORS headers for the browser-facing Edge Functions.
 *
 * The site is served from a different origin than the functions (GitHub Pages
 * vs. *.supabase.co), so every response needs these and every function must
 * answer the preflight OPTIONS request.
 *
 * `*` is appropriate here: these endpoints are called by anonymous visitors
 * from a public site and carry no cookies, so there is no cross-origin session
 * to protect. Locking it to one origin would also break local development,
 * preview builds and any future custom domain.
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}
