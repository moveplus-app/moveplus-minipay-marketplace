// shoebox-available — GET ?design=A  Returns listed shoebox stock from DB (synced / indexer).
// Public read; uses service role for count (no PII).

import { serve } from "https://"
import { createClient } from "https://"

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  })
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    },
  })
}

function priceLabel(): string {
  const raw = Deno.env.get("SHOEBOX_PRICE_ENR")?.trim()
  if (raw) return `${raw} ENR`
  return "10 ENR"
}

serve(async (req) => {
  if (req.method === "OPTIONS") return corsPreflight()
  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500)
  }

  const url = new URL(req.url)
  const design = (url.searchParams.get("design") ?? "A").trim().toUpperCase()
  if (!/^[A-G]$/.test(design)) {
    return jsonResponse({ error: "invalid_design" }, 400)
  }

  const admin = createClient(supabaseUrl, serviceKey)

  const { count, error } = await admin
    .from("user_nfts")
    .select("*", { count: "exact", head: true })
    .eq("nft_type", "shoebox")
    .eq("is_listed", true)
    .eq("shoebox_design", design)
    .eq("is_deprecated", false)

  if (error) {
    console.error("shoebox-available", error.message)
    return jsonResponse({ error: "query_failed" }, 500)
  }

  return jsonResponse({
    design,
    stock: count ?? 0,
    price: priceLabel(),
  }, 200)
})
