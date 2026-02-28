import { env } from "../config/env.js";
import type { NinLookupData, NinLookupResponse } from "../types/nin.js";

/** Stub NIN response for when API is not configured or for testing */
const STUB_NIN_DATA: NinLookupData = {
  birthcountry: "nigeria",
  birthdate: "01-01-1990",
  birthlga: "Lagos Mainland",
  birthstate: "Lagos",
  educationallevel: "tertiary",
  email: "",
  employmentstatus: "employed",
  firstname: "WIGO",
  gender: "m",
  heigth: "150",
  maritalstatus: "single",
  middlename: "SAMUEL",
  nin: "09876543212",
  nok_address1: "3B MICHAEL WISDOM STREET",
  nok_address2: "",
  nok_firstname: "AISHA",
  nok_lga: "Lagos Island",
  nok_middlename: "",
  nok_postalcode: "",
  nok_state: "Lagos",
  nok_surname: "AGBA",
  nok_town: "FESTAC",
  ospokenlang: "",
  pfirstname: "",
  photo: "",
  pmiddlename: "",
  profession: "ENGINEER",
  psurname: "",
  religion: "islam",
  residence_address: "2A MUSA ADE STREET",
  residence_lga: "Ogba",
  residence_state: "Lagos",
  residence_town: "OGBA",
  residencestatus: "birth",
  self_origin_lga: "",
  self_origin_place: "",
  self_origin_state: "",
  signature: "",
  spoken_language: "YORUBA",
  surname: "MUSA",
  telephoneno: "08012345678",
  title: "mr",
  userid: "",
  vnin: "",
  central_iD: "123456",
  tracking_id: "ABC0DEFG5000XYZ"
};

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
  if (!env.ninApiUrl?.trim()) {
    return {
      ok: true,
      data: { ...STUB_NIN_DATA, nin }
    };
  }

  try {
    const url = `${env.ninApiUrl.replace(/\/$/, "")}/lookup`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.ninApiKey ? { Authorization: `Bearer ${env.ninApiKey}` } : {})
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
