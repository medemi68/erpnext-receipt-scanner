frappe.listview_settings['Purchase Invoice'] = {
    onload: function(listview) {
        frappe.xcall('invoice2erpnext.utils.check_settings_enabled')
            .then(enabled => {
                if (enabled) {
                    listview.page.add_menu_item(__('Upload (Auto)'), function() {
                        show_currency_dialog(function(currency) {
                            new frappe.ui.FileUploader({
                                as_dataurl: false,
                                allow_multiple: true,
                                on_success: function(file_doc) {
                                    create_purchase_invoice_from_files(file_doc, listview, 'auto', null, null, currency);
                                }
                            });
                        });
                    });
                    listview.page.add_menu_item(__('Upload (Manual)'), function() {
                        new frappe.ui.FileUploader({
                            as_dataurl: false,
                            allow_multiple: true,
                            on_success: function(file_doc) {
                                create_purchase_invoice_from_files(file_doc, listview, 'manual');
                            }
                        });
                    });

                    // Bulk action for recategorizing selected invoices
                    listview.page.add_action_item(__('Recategorize Expenses (AI)'), function() {
                        const selected = listview.get_checked_items();
                        if (selected.length === 0) {
                            frappe.msgprint(__('Please select at least one Purchase Invoice'));
                            return;
                        }

                        const invoice_names = selected.map(d => d.name);

                        frappe.show_alert({
                            message: __('Sending {0} invoice(s) to AI for categorization...', [invoice_names.length]),
                            indicator: 'blue'
                        });

                        frappe.call({
                            method: 'invoice2erpnext.invoice2erpnext.doctype.invoice2erpnext_settings.invoice2erpnext_settings.recategorize_invoices',
                            args: { invoice_names: invoice_names },
                            callback: function(r) {
                                if (r.message && r.message.length > 0) {
                                    show_review_dialog(r.message, listview);
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
                    });
                }
            })
            .catch(() => {});
    }
};

// Dialog to select currency before upload (Auto mode)
function show_currency_dialog(callback) {
    const dialog = new frappe.ui.Dialog({
        title: __('Select Currency'),
        fields: [
            {
                label: __('Currency'),
                fieldname: 'currency',
                fieldtype: 'Link',
                options: 'Currency',
                description: __('Leave blank to use the currency detected from the invoice'),
            }
        ],
        primary_action_label: __('Upload'),
        primary_action: function(values) {
            dialog.hide();
            callback(values.currency || '');
        }
    });
    dialog.show();
}

// Process uploaded files
function create_purchase_invoice_from_files(file_docs, listview, mode, supplier, item, currency) {
    if (!Array.isArray(file_docs)) {
        file_docs = [file_docs];
    }

    if (file_docs.length === 0) return;

    // If manual mode, show dialog to select supplier, item, and currency
    if (mode === 'manual') {
        show_manual_dialog(file_docs, listview);
        return;
    }

    // Auto mode processing
    const total = file_docs.length;
    let processed = 0;

    const dialog = new frappe.ui.Dialog({
        title: __('Creating Documents'),
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'progress_area',
                options: `<div class="progress">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
                <p class="text-muted" style="margin-top: 10px">
                    <span class="processed">0</span> ${__('of')} ${total} ${__('documents created')}
                </p>`
            }
        ]
    });

    dialog.show();

    function process_next_file(index) {
        if (index >= file_docs.length) {
            setTimeout(() => {
                dialog.hide();
                frappe.show_alert({
                    message: __(`Created ${processed} documents successfully`),
                    indicator: 'green'
                });
                listview.refresh();
            }, 1000);
            return;
        }

        const file_doc = file_docs[index];

        frappe.call({
            method: 'invoice2erpnext.invoice2erpnext.doctype.invoice2erpnext_log.invoice2erpnext_log.create_purchase_invoice_from_file',
            args: {
                file_doc_name: file_doc.name,
                mode: mode,
                currency_override: currency || ''
            },
            callback: function(r) {
                processed++;
                const percent = (processed / total) * 100;
                dialog.$wrapper.find('.progress-bar').css('width', percent + '%');
                dialog.$wrapper.find('.processed').text(processed);
                process_next_file(index + 1);
            }
        });
    }

    process_next_file(0);
}

// Dialog for manual mode - supplier, item, and currency selection
function show_manual_dialog(file_docs, listview) {
    if (file_docs.length === 0) return;

    const dialog = new frappe.ui.Dialog({
        title: __('Select Supplier, Item and Currency'),
        fields: [
            {
                label: __('Supplier'),
                fieldname: 'supplier',
                fieldtype: 'Link',
                options: 'Supplier',
                reqd: 1,
                get_query: function() {
                    return { filters: { 'disabled': 0 } };
                }
            },
            {
                label: __('Item'),
                fieldname: 'item',
                fieldtype: 'Link',
                options: 'Item',
                reqd: 1,
                get_query: function() {
                    return { filters: { 'disabled': 0, 'is_purchase_item': 1 } };
                }
            },
            {
                label: __('Currency'),
                fieldname: 'currency',
                fieldtype: 'Link',
                options: 'Currency',
                description: __('Leave blank to use the currency detected from the invoice'),
            }
        ],
        primary_action_label: __('Create'),
        primary_action: function(values) {
            dialog.hide();
            process_manual_files(file_docs, listview, values.supplier, values.item, values.currency || '');
        }
    });

    dialog.show();
}

// Review dialog for AI expense recategorization
function show_review_dialog(results, listview) {
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
                <td style="text-align: right;">${parseFloat(item.amount || 0).toFixed(2)}</td>
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
                args: { changes: selected_changes },
                callback: function(r) {
                    if (r.message && r.message.success) {
                        frappe.show_alert({
                            message: __('Updated {0} invoice(s) successfully', [r.message.updated_count]),
                            indicator: 'green'
                        });
                        if (listview) listview.refresh();
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

    review_dialog.$wrapper.find('#recategorize-select-all').on('change', function() {
        const checked = $(this).prop('checked');
        review_dialog.$wrapper.find('.recategorize-check:not(:disabled)').prop('checked', checked);
    });

    review_dialog.show();
}

// Process files with manual selections
function process_manual_files(file_docs, listview, supplier, item, currency) {
    const total = file_docs.length;
    let processed = 0;

    const progress_dialog = new frappe.ui.Dialog({
        title: __('Creating Documents'),
        fields: [
            {
                fieldtype: 'HTML',
                fieldname: 'progress_area',
                options: `<div class="progress">
                    <div class="progress-bar" style="width: 0%"></div>
                </div>
                <p class="text-muted" style="margin-top: 10px">
                    <span class="processed">0</span> ${__('of')} ${total} ${__('documents created')}
                </p>`
            }
        ]
    });

    progress_dialog.show();

    function process_next_file(index) {
        if (index >= file_docs.length) {
            setTimeout(() => {
                progress_dialog.hide();
                frappe.show_alert({
                    message: __(`Created ${processed} documents successfully`),
                    indicator: 'green'
                });
                listview.refresh();
            }, 1000);
            return;
        }

        const file_doc = file_docs[index];

        frappe.call({
            method: 'invoice2erpnext.invoice2erpnext.doctype.invoice2erpnext_log.invoice2erpnext_log.create_purchase_invoice_from_file',
            args: {
                file_doc_name: file_doc.name,
                mode: 'manual',
                supplier: supplier,
                item: item,
                currency_override: currency
            },
            callback: function(r) {
                processed++;
                const percent = (processed / total) * 100;
                progress_dialog.$wrapper.find('.progress-bar').css('width', percent + '%');
                progress_dialog.$wrapper.find('.processed').text(processed);
                process_next_file(index + 1);
            }
        });
    }

    process_next_file(0);
}
