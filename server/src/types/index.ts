// Types matching the KAINOTOMO API response format that the ERPNext module expects

export interface CurrencyValue {
  amount: number;
  currencyCode?: string;
}

export interface AddressValue {
  streetAddress: string;
  city: string;
  postalCode: string;
  countryRegion: string;
}

export interface FieldWithConfidence<T> {
  confidence: number;
  valueString?: string;
  valueDate?: string;
  valueNumber?: number;
  valueCurrency?: T extends CurrencyValue ? CurrencyValue : never;
  valueAddress?: T extends AddressValue ? AddressValue : never;
}

export interface ExtractedItemFields {
  Description: { valueString: string };
  ProductCode: { valueString: string };
  Quantity: { valueNumber: number };
  UnitPrice: { valueCurrency: CurrencyValue };
  Amount: { valueCurrency: CurrencyValue };
}

export interface ExtractedItem {
  valueObject: ExtractedItemFields;
}

export interface ExtractedDoc {
  InvoiceId: { valueString: string; confidence: number };
  InvoiceDate: { valueDate: string; confidence: number };
  VendorName: { valueString: string; confidence: number };
  VendorAddress: { valueAddress: AddressValue; confidence: number };
  VendorTaxId: { valueString: string; confidence: number };
  InvoiceTotal: { valueCurrency: CurrencyValue; confidence: number };
  SubTotal: { valueCurrency: CurrencyValue; confidence: number };
  TotalTax: { valueCurrency: CurrencyValue; confidence: number };
  TotalDiscount: { valueCurrency: CurrencyValue; confidence: number };
  PaymentTerm: { valueString: string };
  Items: { valueArray: ExtractedItem[] };
}

export interface KainotomoResponse {
  message: {
    success: boolean;
    cost: number;
    extracted_doc: string; // JSON string of ExtractedDoc - CRITICAL: must be string, not object
  };
}

export interface CreditsResponse {
  message: {
    success: boolean;
    credits: number;
  };
}

export interface AIExtractionResult {
  InvoiceId: string;
  InvoiceDate: string;
  VendorName: string;
  VendorAddress: {
    streetAddress: string;
    city: string;
    postalCode: string;
    countryRegion: string;
  };
  VendorTaxId: string;
  InvoiceTotal: number;
  CurrencyCode: string;
  SubTotal: number;
  TotalTax: number;
  TotalDiscount: number;
  PaymentTerm: string;
  Items: Array<{
    Description: string;
    ProductCode: string;
    Quantity: number;
    UnitPrice: number;
    Amount: number;
  }>;
  Confidence: {
    InvoiceId: number;
    InvoiceDate: number;
    VendorName: number;
    VendorAddress: number;
    VendorTaxId: number;
    InvoiceTotal: number;
    SubTotal: number;
    TotalTax: number;
    TotalDiscount: number;
  };
}
