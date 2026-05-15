import { uuidv7 } from 'uuidv7';
import { db } from '../db';

console.log("[Background Worker] Booting up Global NoSQL Engine...");


// Establish the Message Listener (The REST-like API)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

    if (request.action === "AUTOFILL") {

        console.log("Autofill request is received");
        (async () => {
            const origin = new URL(sender.tab!.url!).origin;
            const form = await db.forms.get(origin);
            if (!(form && form.fields[request.selector])) {
                console.log("Nothing found to autofill.");
                return; // form doesn exist or selector not found -> nothing to do
            }
            // dummy_settings.detected_form = origin;

            const activeFileId = (await chrome.storage.local.get('activeFileId')).activeFileId;
            console.log(request.profile)

            const profile = request.profile ? 
                await db.file_rows.where('[fileId+primary_key_value]').equals([activeFileId, request.profile]).first() 
                : undefined;

            const getAutofill = async (selector: string) => {
                const selector_value = form.fields[selector];
                console.log(selector_value)
                if (selector_value) {
                    if (selector_value.is_hardcoded) {
                        return selector_value.autofill_value;
                    } else if (profile) { // not hardcoded data requires an active profile to fetch data
                        const file_metadata = await db.file_metadata.get(profile.fileId);
                        if (!file_metadata) {
                            return 'ERROR';
                        }
                        const column_name = file_metadata.alias2column[selector_value.autofill_value]; // since fileId taken from profile metadata must exist
                        return profile[column_name];
                    }
                }
            }

            if (request.param === 'single') {
                const value = await getAutofill(request.selector);
                sendResponse({ok: true, payload: [{selector: request.selector, value: value}]})
            } else if (request.param === 'all') {
                const selector_list: {selector: string; value: string | undefined}[] = [];
                for (const selector of Object.keys(form.fields)) {
                    selector_list.push({selector: selector, value: await getAutofill(selector)})
                }
                console.log(selector_list)
                sendResponse({ok: true, payload: selector_list})
            }
        })();

        // CRITICAL: Return true to tell Chrome this is an asynchronous response
        return true; 


    } else if (request.action === "SET_SELECTOR") {
        // message listener cant be async -> use IIFE pattern
        (async () => {
        const origin = new URL(sender.tab!.url!).origin;
        // dummy_settings.detected_form = origin;
        const existing = await db.forms.get(origin);
        
        if (existing) {
            await db.forms.update(origin, {
                fields: {
                    ...existing.fields,
                    [request.selector]: {
                        field_type: request.type,
                        autofill_value: request.value,
                        is_hardcoded: request.is_hardcoded
                    }
                }
            })
        } else {
            await db.forms.add({
                origin: origin,
                created_at: new Date().toLocaleString(),
                fields: {
                    [request.selector]: {
                        field_type: request.type,
                        autofill_value: request.value,
                        is_hardcoded: request.is_hardcoded
                    }
                }
            })
        }

        sendResponse({ ok: true })
    })();
    return true; 


    } else if (request.action === "DELETE_SELECTOR") {
        (async () => {
            const origin = new URL(sender.tab!.url!).origin;
            // dummy_settings.detected_form = origin;
            const existing = await db.forms.get(origin);

            if (existing) {
                const { [request.selector]: _, ...remainingFields } = existing.fields
                await db.forms.update(origin, { fields: remainingFields })
            }
            sendResponse({ ok: true })
        })();
        return true;


    } else if (request.action === "HAS_SELECTOR") {
        (async () => {
            const origin = new URL(sender.tab!.url!).origin;
            const form = await db.forms.get(origin);
            if (!(form && form.fields[request.selector])) {
                // form doesn exist or selector not found -> nothing to do
                sendResponse({ ok: true, has_selector: false})
            } else {
                sendResponse({ ok: true, has_selector: true});
            }
        })();
        return true;
    
    
    } else if (request.action === 'GET_ALIASES') {
        (async () => {
            try {
                const activeFileId = (await chrome.storage.local.get('activeFileId')).activeFileId;
                if (!activeFileId || typeof activeFileId !== 'string') {
                    sendResponse({ ok: true, payload: []});
                    return;
                }

                const file_metadata = await db.file_metadata.get(activeFileId);
                if (file_metadata && file_metadata.alias2column) {
                    sendResponse({ ok: true, payload: Object.keys(file_metadata.alias2column) })
                } else {
                    sendResponse({ ok: true, payload: []});
                }   
            } catch (error) {
                console.error("[Background] GET_ALIASES Error:", error);
                sendResponse({ ok: false, payload: [] });
            }   
        })();
        return true;
    }
})

