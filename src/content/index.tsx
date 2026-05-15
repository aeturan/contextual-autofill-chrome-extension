console.log("Tracer Bullet: Content Script Injected Successfully");

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
        const save_selector = () => {
            const input_value = formElement.value;
            chrome.runtime.sendMessage({
                action: "SET_SELECTOR", 
                selector: exactCoordinate, 
                value: input_value,
                type: formElement.type,
                is_hardcoded: !input_value.startsWith("#")// TODO: fragile logic. Change when floating bubble is added
            }, (response) => {
                if (response && response.ok) {
                    formElement.style.backgroundColor = "#00c851";  // green = "saved"
                    console.log(`[RECORDED] ${exactCoordinate} -> ${input_value}`);
                    setTimeout(() => formElement.style.backgroundColor = "", 1000);
                }
            });
        }

        formElement.addEventListener('blur', save_selector, { once: true });
        
        return;
    }

    // ROUTE C: "Autofill" Intent (Standard Click)
    chrome.runtime.sendMessage({
        action: "AUTOFILL",
        param: "single", // single (target field) or all (fields on the page)
        selector: exactCoordinate,
        profile: "erkantare@gmail.com" // todo - chrome.storage.session.get(...)
    }, (response) => {
        console.log("Autofill Response")
        console.log(response);
        if (response && response.ok && response.payload) {
            for (const {selector, value} of response.payload) {
                const input_field = document.querySelector(selector) as FormElement;
                input_field.value = value;
                
                const eventName = target.tagName === 'INPUT' ? 'input' : 'change'; // both INPUT and TEXTAREA use input.
                formElement.dispatchEvent(new Event(eventName, { bubbles: true }));
                
                formElement.style.backgroundColor = "#b2dfdb"; // green
                console.log(`[AUTOFILLED] Pulled "${value}" from Dexie NoSQL!`);
                setTimeout(() => formElement.style.background = "", 1000)
            }
        }
    })

    // chrome.storage.local.get(exactCoordinate, async (result) => { // a result object containing the key-value pair
    //     const semanticKey = result[exactCoordinate]; // e.g., "first_name"

    //     if (semanticKey && typeof semanticKey === 'string') {// If it returns undefined (no match for exactCoordinate in DB), the user just clicked a random, untracked text box, and we do nothing.

    //         // NEW: Request the data from the Background Worker instead of local Dexie
    //         console.log(`[NETWORK] Requesting profile for "Alice" from Background Worker...`);

    //         chrome.runtime.sendMessage({ action: "GET_PROFILE", payload: "Alice" }, (response) => {
    //             if (response && response.success && response.data) {
    //                 const activeRow = response.data;
    //                 const injectionValue = activeRow.data[semanticKey]

    //                 if (injectionValue) {
    //                     formElement.value = injectionValue;
    //                     const eventName = target.tagName === 'INPUT' ? 'input' : 'change'; // both INPUT and TEXTAREA use input.
    //                     // The Virtual DOM Hack - simulating actual click - so react, angular etc. will notice
    //                     formElement.dispatchEvent(new Event(eventName, { bubbles: true }));
                        
    //                     formElement.style.backgroundColor = "#b2dfdb"; // green
    //                     console.log(`[AUTOFILLED] Pulled "${injectionValue}" from Dexie NoSQL!`);
    //                     setTimeout(() => formElement.style.background = "", 1000)
    //                 }
    //             } else {
    //                 console.error("[NETWORK ERROR] Failed to fetch from Background Worker.");
    //             }
    //         });
    //     }
    // })
}, { capture: true });

