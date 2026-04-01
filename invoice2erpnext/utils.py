# Copyright (c) 2025, KAINOTOMO PH LTD and contributors
# For license information, please see license.txt

import frappe

def format_currency_value(value):
    """
    Helper function to format currency values according to system settings
    
    Args:
        value: The value to format (string or numeric)
        
    Returns:
        str: Formatted value according to system number format and currency precision
    """
    # First ensure we have a float value to work with
    if isinstance(value, str):
        # Handle if value is in string format with comma or period
        value_float = float(value.replace(',', '.'))
    else:
        value_float = float(value)
    
    # Get currency precision from Frappe
    try:
        currency_precision = frappe.get_precision("Currency", "amount")
        if currency_precision is None:
            currency_precision = 2  # Default to 2 decimal places
    except:
        currency_precision = 2  # Default to 2 decimal places if anything goes wrong
    
    # Round the value to the specified precision
    value_float = round(value_float, currency_precision)
    
    # Format with the exact number of decimal places
    value_str = f"{{:.{currency_precision}f}}".format(value_float)
    
    # Get the number format from system settings
    number_format = frappe.get_system_settings('number_format')
    
    # Format according to the system's number format
    if number_format == "#.###,##":  # European format (1.234,56)
        formatted_value = value_str.replace(".", ",")
    elif number_format == "# ###.##":  # Format with space (1 234.56)
        integer_part, decimal_part = value_str.split(".")
        formatted_value = f"{integer_part} {decimal_part}"
    elif number_format == "#,###.##":  # US format (1,234.56)
        formatted_value = value_str
    else:
        # Default format if none of the above
        formatted_value = value_str
    
    return formatted_value

def override_party_account_currency_cache(doc, method):
    """Before-validate hook for Purchase Invoice.

    ERPNext enforces single-currency-per-supplier at two levels:
    1. validate_currency() checks the supplier's party account currency
    2. validate_party_gle_currency() (during submit/GL creation) checks
       that new GL entries match the supplier's historical GL currency

    When the plugin sets a different currency with a matching credit_to
    account, both validations are false positives.  This hook overrides
    the relevant caches so both checks pass.
    """
    if doc.currency and doc.supplier and doc.company:
        # Override for validate_currency()
        frappe.local.cache.setdefault("party_account_currency", {})[
            ("Supplier", doc.supplier, doc.company)
        ] = doc.currency

        # Override for validate_party_gle_currency() during GL entry creation.
        # Set the "historical" GL currency to match the credit_to account's
        # currency so the GL entry validation passes on submit.
        credit_to_currency = doc.currency
        if doc.credit_to:
            credit_to_currency = frappe.get_cached_value(
                "Account", doc.credit_to, "account_currency"
            ) or doc.currency
        frappe.local.cache.setdefault("party_gle_currency", {})[
            ("Supplier", doc.supplier, doc.company)
        ] = credit_to_currency


@frappe.whitelist()
def check_settings_enabled():
    """Safely check if Invoice2Erpnext is enabled without permission errors"""
    # First check if user has permission to read the settings
    if not frappe.has_permission("Invoice2Erpnext Settings", "read"):
        return 0
    
    try:
        return frappe.db.get_single_value('Invoice2Erpnext Settings', 'enabled')
    except:
        # Return 0 (disabled) if any error occurs
        return 0