# Copyright (c) 2025, KAINOTOMO PH LTD and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
import requests
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


# Add a global function that doesn't require document permissions
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
