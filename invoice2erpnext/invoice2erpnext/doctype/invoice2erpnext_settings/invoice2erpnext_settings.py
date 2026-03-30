# Copyright (c) 2025, KAINOTOMO PH LTD and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import requests
import json
from invoice2erpnext.utils import format_currency_value

class Invoice2ErpnextSettings(Document):
    """Settings for Invoice2ERPNext integration"""

    @frappe.whitelist()
    def get_credits(self):
        """Test connection to self-hosted OCR server and fetch credits (stub)"""

        if hasattr(self, 'enabled') and self.enabled == 0:
            return {
                "success": False,
                "message": "Integration is disabled. Please enable it in settings."
            }

        if not self.server_url:
            return {
                "success": False,
                "message": "Server URL is not configured."
            }

        try:
            api_key = self.get_password('api_key')
            api_secret = self.get_password('api_secret')

            headers = {
                "Authorization": f"token {api_key}:{api_secret}",
                "Content-Type": "application/json"
            }

            endpoint = f"{self.server_url.rstrip('/')}/api/method/doc2sys.doc2sys.doctype.doc2sys_user_settings.doc2sys_user_settings.get_user_credits"

            response = requests.post(
                endpoint,
                headers=headers,
                json={}
            )

            if response.status_code == 200:
                result = response.json()

                if result.get("message") and result["message"].get("success"):
                    credits = result["message"].get("credits", 0)
                    formatted_credits = format_currency_value(credits)

                    return {
                        "success": True,
                        "credits": formatted_credits,
                        "message": "Successfully connected to OCR server"
                    }
                else:
                    error_msg = result.get("message", {}).get("message", "API returned error")
                    return {
                        "success": False,
                        "message": f"API Error: {error_msg}"
                    }
            else:
                return {
                    "success": False,
                    "message": f"HTTP Error: {response.status_code} - {response.text}"
                }

        except Exception as e:
            frappe.log_error(f"OCR Server Connection Error: {str(e)}", "Invoice2ERPNext")
            return {
                "success": False,
                "message": f"Connection Error: {str(e)}"
            }

    @frappe.whitelist()
    def test_connection(self):
        """Test the connection to the OCR server"""
        self.enabled = 1
        result = self.get_credits()
        if result.get("success"):
            self.enabled = 1
        else:
            self.enabled = 0

        self.save()

        return result


@frappe.whitelist(allow_guest=False)
def get_available_credits():
    """Get available credits - accessible to all authenticated users"""
    try:
        if not frappe.db.exists("Invoice2Erpnext Settings", "Invoice2Erpnext Settings"):
            return {
                "value": 0,
                "fieldtype": "Currency",
            }

        settings = frappe.get_doc("Invoice2Erpnext Settings", "Invoice2Erpnext Settings")
        settings.flags.ignore_permissions = True

        result = settings.get_credits()

        credits = 0
        if result.get("success") and "credits" in result:
            credits = result["credits"]

        return {
            "value": credits,
            "fieldtype": "Currency",
        }
    except Exception as e:
        frappe.log_error(f"Error fetching credits for all users: {str(e)}", "Invoice2Erpnext Credits")
        return {
            "value": 0,
            "fieldtype": "Currency",
        }


@frappe.whitelist(allow_guest=False)
def recategorize_invoices(invoice_names):
    """Send Purchase Invoice line items to the OCR server for expense account recategorization"""
    if isinstance(invoice_names, str):
        invoice_names = json.loads(invoice_names)

    settings = frappe.get_doc("Invoice2Erpnext Settings")
    if not settings.server_url:
        frappe.throw("Server URL is not configured")

    # Fetch expense accounts
    company = frappe.defaults.get_defaults().get("company")
    if not company:
        frappe.throw("No default company set")

    expense_accounts = [
        a["name"] for a in frappe.get_all(
            "Account",
            filters={"company": company, "root_type": "Expense", "is_group": 0},
            fields=["name"],
            order_by="name",
        )
    ]

    if not expense_accounts:
        frappe.throw("No expense accounts found")

    # Build invoice data for the API
    invoices_data = []
    for inv_name in invoice_names:
        inv = frappe.get_doc("Purchase Invoice", inv_name)
        items = []
        for item in inv.items:
            items.append({
                "idx": item.idx,
                "item_code": item.item_code or "",
                "description": item.description or item.item_name or "",
                "current_account": item.expense_account or "",
                "amount": float(item.amount or 0),
            })
        invoices_data.append({
            "name": inv_name,
            "supplier": inv.supplier_name or inv.supplier or "",
            "items": items,
        })

    # Call the OCR server categorization endpoint
    api_key = settings.get('api_key')
    api_secret = settings.get_password('api_secret')

    response = requests.post(
        f"{settings.server_url.rstrip('/')}/api/method/categorize_expenses",
        headers={
            "Authorization": f"token {api_key}:{api_secret}",
            "Content-Type": "application/json",
        },
        json={
            "invoices": invoices_data,
            "expense_accounts": expense_accounts,
        },
    )

    if response.status_code != 200:
        frappe.throw(f"Server error: {response.status_code} - {response.text}")

    data = response.json()
    if not data.get("success"):
        frappe.throw(f"Categorization failed: {data.get('message', 'Unknown error')}")

    return data.get("results", [])


@frappe.whitelist(allow_guest=False)
def apply_recategorization(changes):
    """Apply approved expense account changes to Purchase Invoice items.

    Works on both draft and submitted invoices.
    For submitted invoices, updates the GL entries directly.
    """
    if isinstance(changes, str):
        changes = json.loads(changes)

    updated_invoices = set()

    for change in changes:
        inv_name = change.get("invoice")
        idx = change.get("idx")
        new_account = change.get("suggested_account")

        if not inv_name or idx is None or not new_account:
            continue

        idx = int(idx)  # Ensure idx is an integer for comparison

        if not frappe.db.exists("Account", new_account):
            frappe.log_error(f"Account not found: {new_account}")
            continue

        inv = frappe.get_doc("Purchase Invoice", inv_name)

        # Find the item row
        target_item = None
        for item in inv.items:
            if item.idx == idx:
                target_item = item
                break

        if not target_item:
            continue

        old_account = target_item.expense_account

        if old_account == new_account:
            continue

        if inv.docstatus == 0:
            # Draft - just update and save
            target_item.expense_account = new_account
            inv.save(ignore_permissions=True)
        elif inv.docstatus == 1:
            # Submitted - update the item directly in DB and fix GL entries
            frappe.db.set_value(
                "Purchase Invoice Item",
                target_item.name,
                "expense_account",
                new_account,
                update_modified=False,
            )

            # Update the corresponding GL Entry (only non-cancelled entries)
            frappe.db.sql("""
                UPDATE `tabGL Entry`
                SET account = %s
                WHERE voucher_type = 'Purchase Invoice'
                  AND voucher_no = %s
                  AND account = %s
                  AND voucher_detail_no = %s
                  AND is_cancelled = 0
            """, (new_account, inv_name, old_account, target_item.name))
        else:
            # Cancelled - skip
            continue

        updated_invoices.add(inv_name)

    frappe.db.commit()

    return {
        "success": True,
        "updated_count": len(updated_invoices),
        "updated_invoices": list(updated_invoices),
    }
