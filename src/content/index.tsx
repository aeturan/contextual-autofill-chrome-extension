import { renderBubble, renderRecordBubble } from './bubble';

console.log("Content Script Injected Successfully");

// creates the CSS Selector -> walks backward up the HTML tree.
function getDomPath(el: HTMLElement | null): string {
    // Base cases
    if (!el) return '';
    if (el.id) return `#${el.id}`; // Best case: IDs are universally unique indexing keys.
    if (el.tagName === 'BODY') return 'BODY'; // We reached the top of the document.

    let nth = 1;
    let sibling = el.previousElementSibling; // If element is the first one, it returns null.

    // A while-loop to count siblings. 
    // If the input is the 3rd <div> inside a form, this counts 1, 2, 3.
    // tagName is all capital DIV, BODY etc.
    while (sibling) {
        if (sibling.tagName === el.tagName) nth++;
        sibling = sibling.previousElementSibling;
    }
    // Recursion: It calls itself on the parent element, building the string backward.
    // Result looks like: "BODY > DIV:nth-of-type(2) > FORM > INPUT:nth-of-type(1)"
    return `${getDomPath(el.parentElement)} > ${el.tagName}:nth-of-type(${nth})`;
}


// attach one listener to the document (the root), not 50 listeners to 50 inputs
document.addEventListener('click', async (event: MouseEvent) => {    
    const target = event.target as HTMLElement;
    const tag = target.tagName;
    const SUPPORTED_TAGS = ['INPUT', 'SELECT', 'TEXTAREA'];
    
    console.log(tag);
    if (!target || !SUPPORTED_TAGS.includes(tag)) return;
    // cast it strictly to input, textarea or select so we can access the .value property later.
    type FormElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    const formElement = target as FormElement;
    console.log(formElement.type)

    const exactCoordinate = getDomPath(formElement);

    // event.preventDefault(); // stops the browser from doing whatever a click normally does (like focusing the field) so our extension can completely hijack the interaction.

    if (event.altKey) {

        // ROUTE A: Delete Selector (alt+shift+click)
        if (event.shiftKey) {
            chrome.runtime.sendMessage({
                action:"DELETE_SELECTOR", 
                selector: exactCoordinate
            }, (response) => {
                if (response && response.ok) {
                    formElement.style.backgroundColor = "#ff0800"; // red
                    console.log(`[DELETED] ${exactCoordinate}`);
                    setTimeout(()  => formElement.style.backgroundColor = "", 1000)
                }
            })
            chrome.storage.local.remove(exactCoordinate, () => {
                formElement.style.backgroundColor = "#ff0800"; // red
                
            })
            return;
        } 

        // ROUTE B: "Record" Intent (Alt + Click)
        formElement.style.backgroundColor = "#fff3cd"  // yellow = "waiting for input"
        console.log(formElement.type)
        // 1. Ask the Background Worker for the active alias mapping keys
        chrome.runtime.sendMessage({ action: "GET_ALIASES" }, (response) => {
            // Default to empty array if the background worker hasn't been set up yet
            const aliases = (response && response.ok && response.payload) ? response.payload : [];

            // 2. Render the Record Bubble
            renderRecordBubble(
                formElement, 
                aliases, 
                
                // 3. The Unified Save Callback (Handles both hardcoded and alias selections)
                (inputValue: string, isHardcoded: boolean) => {
                    chrome.runtime.sendMessage({
                        action: "SET_SELECTOR", 
                        selector: exactCoordinate, 
                        value: inputValue,
                        type: formElement.type,
                        is_hardcoded: isHardcoded // Passed strictly from the UI layer
                    }, (setResponse) => {
                        if (setResponse && setResponse.ok) {
                            formElement.style.backgroundColor = "#00c851";  // green
                            console.log(`[RECORDED] ${exactCoordinate} -> ${inputValue} (hardcoded: ${isHardcoded})`);
                            setTimeout(() => formElement.style.backgroundColor = "", 1000);
                        }
                    });
                }
            );
        });
        // const save_selector = () => {
        //     const input_value = formElement.value;
        //     chrome.runtime.sendMessage({
        //         action: "SET_SELECTOR", 
        //         selector: exactCoordinate, 
        //         value: input_value,
        //         type: formElement.type,
        //         is_hardcoded: !input_value.startsWith("#")// TODO: fragile logic. Change when floating bubble is added
        //     }, (response) => {
        //         if (response && response.ok) {
        //             formElement.style.backgroundColor = "#00c851";  // green = "saved"
        //             console.log(`[RECORDED] ${exactCoordinate} -> ${input_value}`);
        //             setTimeout(() => formElement.style.backgroundColor = "", 1000);
        //         }
        //     });
        // }

        // formElement.addEventListener('blur', save_selector, { once: true });
        
        return;
    }



    // ROUTE C: "Autofill" Intent (Standard Click)
    const storageResult = await chrome.storage.local.get('activeProfileKey');
    const activeProfile = storageResult.activeProfileKey;
    const profileHint = activeProfile || "No Active Profile";

    // 1. Create a reusable function to handle the API call
    const executeAutofill = (mode: "single" | "all") => {
        chrome.runtime.sendMessage({
            action: "AUTOFILL",
            param: mode, // <--- Now it dynamically uses 'single' or 'all'
            selector: exactCoordinate,
            profile: activeProfile 
        }, (response) => {
            console.log(`Autofill Response (${mode})`, response);
            if (response && response.ok && response.payload) {
                for (const {selector, value} of response.payload) {
                    const input_field = document.querySelector(selector) as FormElement;
                    if (input_field) {
                        input_field.value = value;
                        
                        const eventName = input_field.tagName === 'INPUT' ? 'input' : 'change';
                        input_field.dispatchEvent(new Event(eventName, { bubbles: true }));
                        
                        input_field.style.backgroundColor = "#b2dfdb"; 
                        console.log(`[AUTOFILLED] Pulled "${value}"!`);
                        setTimeout(() => input_field.style.backgroundColor = "", 1000);
                    }
                }
            }
        });
    };

    // render bubble only if selector is tracked
    chrome.runtime.sendMessage({
            action: "HAS_SELECTOR",
            selector: exactCoordinate
        }, (response) => {
                if (response && response.ok && response.has_selector) {
                    // 2. Pass the helper function into the Bubble
                    renderBubble(
                        formElement, 
                        profileHint, 
                        
                        // CALLBACK 1: onAutofillThis
                        () => {
                            console.log("Triggering Single Autofill...");
                            executeAutofill("single");
                        },

                        // CALLBACK 2: onAutofillAll
                        () => {
                            console.log("Triggering Global Autofill...");
                            executeAutofill("all");
                        }
                    );
                }
    });
    
}, { capture: true });

