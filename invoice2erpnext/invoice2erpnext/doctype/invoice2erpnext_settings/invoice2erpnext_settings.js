// Copyright (c) 2025, KAINOTOMO PH LTD and contributors
// For license information, please see license.txt

frappe.ui.form.on('Invoice2Erpnext Settings', {
    refresh: function(frm) {
        // Test Connection button
        frm.add_custom_button(__('Test Connection'), function() {
            frm.call({
                doc: frm.doc,
                method: 'test_connection',
                callback: function(r) {
                    if (r.message && r.message.success) {
                        frappe.msgprint({
                            title: __('Success'),
                            indicator: 'green',
                            message: __('Connection to OCR server successful!')
                        });
                    } else {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: r.message ? r.message.message : __('Connection failed')
                        });
                    }
                    frm.reload_doc();
                }
            });
        });

        // Recategorize Expenses button
        frm.add_custom_button(__('Recategorize Expenses'), function() {
            show_recategorize_dialog();
        });
    },
});

function show_recategorize_dialog() {
    const select_dialog = new frappe.ui.Dialog({
        title: __('Select Purchase Invoices to Recategorize'),
        size: 'large',
        fields: [
            {
                label: __('Purchase Invoices'),
                fieldname: 'invoices',
                fieldtype: 'MultiSelectList',
                reqd: 1,
                get_data: function(txt) {
                    return frappe.db.get_link_options('Purchase Invoice', txt, {
                        docstatus: ['in', [0, 1]]  // Draft and submitted invoices
                    });
                }
            }
        ],
        primary_action_label: __('Recategorize'),
        primary_action: function(values) {
            if (!values.invoices || values.invoices.length === 0) {
                frappe.msgprint(__('Please select at least one Purchase Invoice'));
                return;
            }

            select_dialog.hide();

            frappe.show_alert({
                message: __('Sending to AI for categorization...'),
                indicator: 'blue'
            });

            frappe.call({
                method: 'invoice2erpnext.invoice2erpnext.doctype.invoice2erpnext_settings.invoice2erpnext_settings.recategorize_invoices',
                args: {
                    invoice_names: values.invoices
                },
                callback: function(r) {
                    if (r.message && r.message.length > 0) {
                        show_review_dialog(r.message);
                    } else {
                        frappe.msgprint(__('No categorization results returned'));
                    }
                },
                error: function() {
                    frappe.msgprint({
                        title: __('Error'),
                        indicator: 'red',
                        message: __('Failed to recategorize. Check the error log for details.')
                    });
                }
            });
        }
    });

    select_dialog.show();
}

function show_review_dialog(results) {
    const changed = results.filter(r => r.current_account !== r.suggested_account);
    const unchanged = results.length - changed.length;

    let table_html = `
        <div style="margin-bottom: 10px;">
            <strong>${changed.length}</strong> ${__('items with suggested changes')},
            <strong>${unchanged}</strong> ${__('items unchanged')}
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
        <table class="table table-bordered table-sm" style="font-size: 12px;">
            <thead>
                <tr>
                    <th style="width: 30px;"><input type="checkbox" id="recategorize-select-all" checked></th>
                    <th>${__('Invoice')}</th>
                    <th>${__('Supplier')}</th>
                    <th>${__('Item')}</th>
                    <th style="text-align: right;">${__('Amount')}</th>
                    <th>${__('Current Account')}</th>
                    <th>${__('Suggested Account')}</th>
                </tr>
            </thead>
            <tbody>`;

    results.forEach(function(item, idx) {
        const is_changed = item.current_account !== item.suggested_account;
        const row_style = is_changed ? '' : 'style="opacity: 0.5;"';
        const desc = frappe.utils.escape_html((item.description || '').substring(0, 35));
        const desc_full = frappe.utils.escape_html(item.description || '');

        table_html += `
            <tr ${row_style}>
                <td><input type="checkbox" class="recategorize-check" data-idx="${idx}"
                    ${is_changed ? 'checked' : ''} ${!is_changed ? 'disabled' : ''}></td>
                <td><a href="/app/purchase-invoice/${item.invoice}" target="_blank">${item.invoice}</a></td>
                <td>${frappe.utils.escape_html(item.supplier || '')}</td>
                <td title="${desc_full}">${desc}${(item.description || '').length > 35 ? '...' : ''}</td>
                <td style="text-align: right;">${format_currency(item.amount)}</td>
                <td>${frappe.utils.escape_html(item.current_account || '')}</td>
                <td><strong>${frappe.utils.escape_html(item.suggested_account || '')}</strong></td>
            </tr>`;
    });

    table_html += `</tbody></table></div>`;

    const review_dialog = new frappe.ui.Dialog({
        title: __('Review Expense Categorization'),
        size: 'extra-large',
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'review_table',
                options: table_html
            }
        ],
        primary_action_label: __('Apply Selected'),
        primary_action: function() {
            const selected_changes = [];
            review_dialog.$wrapper.find('.recategorize-check:checked').each(function() {
                const idx = $(this).data('idx');
                const item = results[idx];
                if (item.current_account !== item.suggested_account) {
                    selected_changes.push(item);
                }
            });

            if (selected_changes.length === 0) {
                frappe.msgprint(__('No changes selected'));
                return;
            }

            review_dialog.hide();

            frappe.call({
                method: 'invoice2erpnext.invoice2erpnext.doctype.invoice2erpnext_settings.invoice2erpnext_settings.apply_recategorization',
                args: {
                    changes: selected_changes
                },
                callback: function(r) {
                    if (r.message && r.message.success) {
                        frappe.show_alert({
                            message: __('Updated {0} invoice(s) successfully', [r.message.updated_count]),
                            indicator: 'green'
                        });
                    } else {
                        frappe.msgprint({
                            title: __('Error'),
                            indicator: 'red',
                            message: __('Failed to apply changes')
                        });
                    }
                }
            });
        },
        secondary_action_label: __('Cancel'),
        secondary_action: function() {
            review_dialog.hide();
        }
    });

    // Select all checkbox handler
    review_dialog.$wrapper.find('#recategorize-select-all').on('change', function() {
        const checked = $(this).prop('checked');
        review_dialog.$wrapper.find('.recategorize-check:not(:disabled)').prop('checked', checked);
    });

    review_dialog.show();
}

function format_currency(amount) {
    if (amount === undefined || amount === null) return '';
    return parseFloat(amount).toFixed(2);
}
