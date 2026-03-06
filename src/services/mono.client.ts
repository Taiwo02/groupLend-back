import { env } from "../config/env.js";
import type { NinLookupData, NinLookupResponse } from "../types/nin.js";

export interface NinLookupResult {
  ok: boolean;
  data?: NinLookupData;
  message?: string;
}

/**
 * Look up NIN from third-party API.
 * If NIN_API_URL is not set, returns stub data for the given NIN (for development).
 */
export async function lookupNin(nin: string): Promise<NinLookupResult> {

  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/lookup/nin`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.monoLookUpdId ? {accept: 'application/json', "mono-sec-key": env.monoLookUpdId } : {})
      },
      body: JSON.stringify({ nin })
    });
    const body = (await res.json()) as NinLookupResponse;

    if (body.status === "successful" && body.data) {
      return { ok: true, data: body.data };
    }
    return {
      ok: false,
      message: body.message ?? "NIN lookup failed"
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "NIN lookup request failed";
    return { ok: false, message };
  }
}
