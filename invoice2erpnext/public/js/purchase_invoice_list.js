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
