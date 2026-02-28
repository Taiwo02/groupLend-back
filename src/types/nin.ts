/** NIN lookup response from third-party (sample structure) */
export interface NinLookupData {
  birthcountry?: string;
  birthdate?: string;
  birthlga?: string;
  birthstate?: string;
  educationallevel?: string;
  email?: string;
  employmentstatus?: string;
  firstname?: string;
  gender?: string;
  heigth?: string;
  maritalstatus?: string;
  middlename?: string;
  nin?: string;
  nok_address1?: string;
  nok_address2?: string;
  nok_firstname?: string;
  nok_lga?: string;
  nok_middlename?: string;
  nok_postalcode?: string;
  nok_state?: string;
  nok_surname?: string;
  nok_town?: string;
  ospokenlang?: string;
  pfirstname?: string;
  photo?: string;
  pmiddlename?: string;
  profession?: string;
  psurname?: string;
  religion?: string;
  residence_address?: string;
  residence_lga?: string;
  residence_state?: string;
  residence_town?: string;
  residencestatus?: string;
  self_origin_lga?: string;
  self_origin_place?: string;
  self_origin_state?: string;
  signature?: string;
  spoken_language?: string;
  surname?: string;
  telephoneno?: string;
  title?: string;
  userid?: string;
  vnin?: string;
  central_iD?: string;
  tracking_id?: string;
}

export interface NinLookupResponse {
  status: string;
  message: string;
  timestamp?: string;
  data?: NinLookupData;
}

/** Full name built from NIN data (firstname + middlename + surname) */
export function ninFullName(data: NinLookupData): string {
  const parts = [
    data.firstname ?? "",
    data.middlename ?? "",
    data.surname ?? ""
  ].filter(Boolean);
  return parts.join(" ").trim();
}

/** Address from NIN for display/confirmation */
export function ninAddress(data: NinLookupData): {
  addressLine1: string;
  town: string;
  lga: string;
  state: string;
} {
  return {
    addressLine1: data.residence_address ?? "",
    town: data.residence_town ?? "",
    lga: data.residence_lga ?? "",
    state: data.residence_state ?? ""
  };
}
