import { env } from "../config/env.js";
import type { NinLookupData, NinLookupResponse } from "../types/nin.js";

export interface NinLookupResult {
  ok: boolean;
  data?: NinLookupData;
  message?: string;
}

/** Account lookup response from Mono (e.g. /lookup/account-number). */
export interface AccountLookupData {
  name: string;
  account_number: string;
  bvn: string | null;
  bank: { name: string; code: string };
}

export interface AccountLookupResponse {
  status: string;
  message?: string;
  timestamp?: string;
  data?: AccountLookupData;
}

export interface AccountLookupResult {
  ok: boolean;
  data?: AccountLookupData;
  message?: string;
}

/** Single bank in the banks list (e.g. /lookup/banks). */
export interface BankListItem {
  name: string;
  bank_code: string | null;
  nip_code: string;
}

export interface BankListResponse {
  status: string;
  message?: string;
  timestamp?: string;
  data?: { banks: BankListItem[] };
}

export interface BankListResult {
  ok: boolean;
  data?: BankListItem[];
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

/**
 * Verify/lookup bank account number (same Mono config as NIN lookup).
 * POST baseurl/lookup/account-number with account_number and bank_code.
 */
export async function verifyAccount(
  accountNumber: string,
  bankCode: string
): Promise<AccountLookupResult> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/lookup/account-number`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.monoLookUpdId ? { accept: "application/json", "mono-sec-key": env.monoLookUpdId } : {})
      },
      body: JSON.stringify({
        account_number: accountNumber.trim(),
        nip_code: bankCode.trim()
      })
    });
    const body = (await res.json()) as AccountLookupResponse;

    if (body.status === "successful" && body.data) {
      return { ok: true, data: body.data };
    }
    return {
      ok: false,
      message: body.message ?? "Account lookup failed"
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Account lookup request failed";
    return { ok: false, message };
  }
}

/**
 * Fetch list of banks (same Mono config).
 * GET baseurl/lookup/banks.
 */
export async function getBankList(): Promise<BankListResult> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/lookup/banks`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        ...(env.monoLookUpdId ? { accept: "application/json", "mono-sec-key": env.monoLookUpdId } : {})
      }
    });
    const body = (await res.json()) as BankListResponse;

    if (body.status === "successful" && body.data?.banks) {
      return { ok: true, data: body.data.banks };
    }
    return {
      ok: false,
      message: body.message ?? "Bank list lookup failed"
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bank list request failed";
    return { ok: false, message };
  }
}
