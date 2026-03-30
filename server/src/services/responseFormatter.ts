import type { AIExtractionResult, ExtractedDoc, KainotomoResponse } from "../types/index.js";

/**
 * Transforms the flat AI extraction result into the nested KAINOTOMO response format
 * that the ERPNext invoice2erpnext module expects.
 *
 * CRITICAL: message.extracted_doc must be a JSON STRING, not an object.
 * The Python module does json.loads(message["extracted_doc"]) on line 136.
 */
export function formatResponse(extraction: AIExtractionResult): KainotomoResponse {
  const extractedDoc: ExtractedDoc = {
    InvoiceId: {
      valueString: extraction.InvoiceId,
      confidence: extraction.Confidence.InvoiceId,
    },
    InvoiceDate: {
      valueDate: extraction.InvoiceDate,
      confidence: extraction.Confidence.InvoiceDate,
    },
    VendorName: {
      valueString: extraction.VendorName,
      confidence: extraction.Confidence.VendorName,
    },
    VendorAddress: {
      valueAddress: {
        streetAddress: extraction.VendorAddress.streetAddress,
        city: extraction.VendorAddress.city,
        postalCode: extraction.VendorAddress.postalCode,
        countryRegion: extraction.VendorAddress.countryRegion,
      },
      confidence: extraction.Confidence.VendorAddress,
    },
    VendorTaxId: {
      valueString: extraction.VendorTaxId,
      confidence: extraction.Confidence.VendorTaxId,
    },
    InvoiceTotal: {
      valueCurrency: {
        amount: extraction.InvoiceTotal,
        currencyCode: extraction.CurrencyCode,
      },
      confidence: extraction.Confidence.InvoiceTotal,
    },
    SubTotal: {
      valueCurrency: {
        amount: extraction.SubTotal,
      },
      confidence: extraction.Confidence.SubTotal,
    },
    TotalTax: {
      valueCurrency: {
        amount: extraction.TotalTax,
      },
      confidence: extraction.Confidence.TotalTax,
    },
    TotalDiscount: {
      valueCurrency: {
        amount: extraction.TotalDiscount,
      },
      confidence: extraction.Confidence.TotalDiscount,
    },
    PaymentTerm: {
      valueString: extraction.PaymentTerm,
    },
    Items: {
      valueArray: extraction.Items.map((item) => ({
        valueObject: {
          Description: { valueString: item.Description },
          ProductCode: { valueString: item.ProductCode },
          Quantity: { valueNumber: item.Quantity },
          UnitPrice: {
            valueCurrency: { amount: item.UnitPrice },
          },
          Amount: {
            valueCurrency: {
              amount: item.Amount,
              currencyCode: extraction.CurrencyCode,
            },
          },
          ExpenseAccount: { valueString: item.ExpenseAccount || "" },
        },
      })),
    },
  };

  return {
    message: {
      success: true,
      cost: 0,
      extracted_doc: JSON.stringify(extractedDoc), // MUST be a string
    },
  };
}
