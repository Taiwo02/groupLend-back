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
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v3/lookup/nin`;
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
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v3/lookup/account-number`;
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
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v3/lookup/banks`;
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

const monoHeaders = (): Record<string, string> =>
  env.monoLookUpdId ? { accept: "application/json", "mono-sec-key": env.monoLookUpdId } : {};

/** Fetch identities for a linked Mono account. */
export async function getIdentities(accountId: string): Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v2/accounts/${encodeURIComponent(accountId)}/identity`;
    const res = await fetch(url, { method: "GET", headers: monoHeaders() });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: (data.message as string) ?? "Identities fetch failed" };
    return { ok: true, data: (data.data as Record<string, unknown>) ?? data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Identities request failed" };
  }
}

/** Update customer on Mono (identity, address, phone). */
export async function updateCustomer(
  accountId: string,
  payload: { identity?: { type: string; number: string }; address?: unknown; phone?: string }
): Promise<{ ok: boolean; message?: string }> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v2/accounts/${encodeURIComponent(accountId)}/customer`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...monoHeaders() },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      return { ok: false, message: (body.message as string) ?? "Update customer failed" };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Update customer failed" };
  }
}

/** Fetch income for a linked Mono account. */
export async function getIncome(accountId: string): Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v2/accounts/${encodeURIComponent(accountId)}/income`;
    const res = await fetch(url, { method: "GET", headers: monoHeaders() });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: (data.message as string) ?? "Income fetch failed" };
    return { ok: true, data: (data.data as Record<string, unknown>) ?? data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Income request failed" };
  }
}

/** Fetch statement for a linked Mono account. */
export async function getStatement(accountId: string): Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v2/accounts/${encodeURIComponent(accountId)}/statement`;
    const res = await fetch(url, { method: "GET", headers: monoHeaders() });
    console.log(res);
    
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: (data.message as string) ?? "Statement fetch failed" };
    return { ok: true, data: (data.data as Record<string, unknown>) ?? data };
  } catch (e) {    
    return { ok: false, message: e instanceof Error ? e.message : "Statement request failed" };
  }
}

/** Fetch details for a linked Mono account. */
export async function getDetails(accountId: string): Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v2/accounts/${encodeURIComponent(accountId)}`;
    const res = await fetch(url, { method: "GET", headers: monoHeaders() });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) return { ok: false, message: (data.message as string) ?? "Details fetch failed" };
    return { ok: true, data: (data.data as Record<string, unknown>) ?? data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Details request failed" };
  }
}

/** Verify address via third-party (Mono lookup). */
export async function verifyAddress(address: Record<string, unknown>): Promise<{ ok: boolean; data?: Record<string, unknown>; message?: string }> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v3/lookup/address`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...monoHeaders() },
      body: JSON.stringify(address)
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (res.ok && (data.status === "successful" || data.data != null)) {
      return { ok: true, data: (data.data as Record<string, unknown>) ?? (data as Record<string, unknown>) };
    }
    return { ok: false, message: (data.message as string) ?? "Address verification failed" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Address verification request failed" };
  }
}

export async function getCreditHistoryByBvn(bvn: string): Promise<{
  ok: boolean;
  data?: Record<string, unknown>;
  message?: string;
}> {
  try {
    const url = `${env.monoApiUrl.replace(/\/$/, "")}/v3/lookup/credit-history/all`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        accept: "application/json",
        ...(env.monoLookUpdId ? { "mono-sec-key": env.monoLookUpdId } : {})
      },
      body: JSON.stringify({ bvn: bvn.trim() })
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const message = (data.message as string) ?? (data.error as string) ?? "Credit history lookup failed";
      return { ok: false, message };
    }
    return { ok: true, data: (data.data as Record<string, unknown>) ?? data };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Credit history request failed"
    };
  }
}

export async function initiateBvn(
  bvn: string,
  scope: string
): Promise<Record<string, unknown>> {
  const url = `${env.monoApiUrl.replace(/\/$/, "")}}/v3/lookup/bvn/initiate`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(env.monoLookUpdId ? { "mono-sec-key": env.monoLookUpdId } : {})
    },
    body: JSON.stringify({ bvn: bvn.trim(), scope })
  });
  const data = (await res.json()) as Record<string, unknown>;
  return data;
}

export async function sendBvnOtp(
  phone: string,
  monoSessionId: string,
  method: string
): Promise<Record<string, unknown>> {
  const url = `${env.monoApiUrl.replace(/\/$/, "")}}/v3/lookup/bvn/verify`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(env.monoLookUpdId ? { "mono-sec-key": env.monoLookUpdId } : {}),
      "x-session-id": monoSessionId
    },
    body: JSON.stringify({ method, phone_number: phone })
  });
  const data = (await res.json()) as Record<string, unknown>;
  return data;
}

/** Helper to pick BVN verification method (phone/email/alternate_phone). */
export function filterBvnMethod(
  methods: { method?: string | null }[] | undefined,
  preferredMethod: string
) {
  if (!methods) return undefined;
  return methods.find(
    (m) => m.method === preferredMethod || m.method === "alternate_phone"
  );
}

/** Mono Connect: create customer (v2/customers). Uses env.monoId (MONO_ID). */
export async function createMonoCustomer(payload: {
  bvn: string;
  email: string;
  firstName: string;
  lastName: string;
  address?: string | null;
  phone?: string | null;
}): Promise<Record<string, unknown>> {
  const url = `${env.monoApiUrl.replace(/\/$/, "")}/v2/customers`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(env.monoId ? { "mono-sec-key": env.monoId } : {})
    },
    body: JSON.stringify({
      identity: { type: "bvn", number: payload.bvn.trim() },
      email: payload.email,
      firstName: payload.firstName,
      lastName: payload.lastName,
      ...(payload.address != null && payload.address !== "" ? { address: payload.address } : {}),
      ...(payload.phone != null && payload.phone !== "" ? { phone: payload.phone } : {})
    })
  });
  const data = (await res.json()) as Record<string, unknown>;
  return data;
}

/** Fetch BVN-linked accounts after OTP verification (v2/lookup/bvn/details). Uses env.monoLookUpdId. */
export async function fetchBvnDetails(
  otp: string,
  monoSessionId: string
): Promise<Record<string, unknown>> {
  const url = `${env.monoApiUrl.replace(/\/$/, "")}/v2/lookup/bvn/details`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(env.monoLookUpdId ? { "mono-sec-key": env.monoLookUpdId } : {}),
      "x-session-id": monoSessionId
    },
    body: JSON.stringify({ otp: otp.trim() })
  });
  const data = (await res.json()) as Record<string, unknown>;
  return data;
}

/** Create direct debit mandate (v3/payments/mandates). Uses env.monoId. Amount in kobo. */
export async function createPaymentMandate(payload: {
  monoCustomerId: string;
  accountNumber: string;
  bankCode: string;
  amountKobo: number;
  startDate: string;
  endDate: string;
  reference: string;
  description?: string;
}): Promise<Record<string, unknown>> {
  const url = `${env.monoApiUrl.replace(/\/$/, "")}/v3/payments/mandates`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      ...(env.monoId ? { "mono-sec-key": env.monoId } : {})
    },
    body: JSON.stringify({
      debit_type: "variable",
      customer: payload.monoCustomerId,
      mandate_type: "emandate",
      amount: payload.amountKobo,
      reference: payload.reference,
      account_number: payload.accountNumber,
      bank_code: payload.bankCode,
      description: payload.description ?? "Credit repayment",
      start_date: payload.startDate,
      end_date: payload.endDate
    })
  });
  const data = (await res.json()) as Record<string, unknown>;
  return data;
}
