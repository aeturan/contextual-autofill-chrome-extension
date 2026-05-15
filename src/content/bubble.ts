export type FormElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

let activeBubble: HTMLElement | null = null;
let currentBlurHandler: ((e: FocusEvent) => void) | null = null;
let currentFormElement: FormElement | null = null;

export function removeBubble() {
    if (activeBubble) {
        activeBubble.remove();
        activeBubble = null;
    }
    if (currentFormElement && currentBlurHandler) {
        currentFormElement.removeEventListener('blur', currentBlurHandler);
        currentBlurHandler = null;
        currentFormElement = null;
    }
}

export function isInsideBubble(target: HTMLElement): boolean {
    return target.closest('#contextual-autofill-bubble') !== null;
}

// ==========================================
// SHARED DRAG ENGINE
// ==========================================
function attachDragEngine(iconBtn: HTMLElement, menuContainer: HTMLElement) {
    let isDragging = false;
    let hasDragged = false;
    let startMouseX = 0, startMouseY = 0, startBubbleX = 0, startBubbleY = 0;

    iconBtn.onmousedown = (e) => {
        e.preventDefault(); 
        isDragging = true;
        hasDragged = false;
        startMouseX = e.clientX;
        startMouseY = e.clientY;
        startBubbleX = parseInt(activeBubble!.style.left || '0', 10);
        startBubbleY = parseInt(activeBubble!.style.top || '0', 10);
        iconBtn.style.cursor = 'grabbing';

        const onMouseMove = (moveEvent: MouseEvent) => {
            if (!isDragging) return;
            const deltaX = moveEvent.clientX - startMouseX;
            const deltaY = moveEvent.clientY - startMouseY;
            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) hasDragged = true;

            if (hasDragged && activeBubble) {
                activeBubble.style.left = `${startBubbleX + deltaX}px`;
                activeBubble.style.top = `${startBubbleY + deltaY}px`;
            }
        };

        const onMouseUp = () => {
            isDragging = false;
            iconBtn.style.cursor = 'pointer';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    iconBtn.onclick = (e) => {
        e.stopPropagation(); 
        if (hasDragged) {
            hasDragged = false; 
            return; 
        }
        iconBtn.style.display = 'none'; 
        menuContainer.style.display = 'flex'; 
    };
}

// ==========================================
// BUBBLE 1: THE AUTOFILL BUBBLE
// ==========================================
export function renderBubble(
    formElement: FormElement, 
    profileHint: string, 
    onAutofillThis: () => void, 
    onAutofillAll: () => void
) {
    removeBubble(); 
    currentFormElement = formElement; 

    const rect = formElement.getBoundingClientRect();
    const xPos = rect.right + window.scrollX - 28 - 8;
    const yPos = rect.top + window.scrollY + (rect.height / 2) - 14;

    activeBubble = document.createElement('div');
    activeBubble.id = 'contextual-autofill-bubble';
    Object.assign(activeBubble.style, {
        position: 'absolute', left: `${xPos}px`, top: `${yPos}px`, 
        zIndex: '999999', fontFamily: 'system-ui, sans-serif'
    });

    const iconBtn = document.createElement('button');
    iconBtn.innerText = '⚡';
    Object.assign(iconBtn.style, {
        width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#2196F3', 
        color: 'white', border: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', 
        cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', 
        padding: '0', fontSize: '14px', transition: 'transform 0.1s'
    });

    const menuContainer = document.createElement('div');
    Object.assign(menuContainer.style, {
        display: 'none', backgroundColor: '#ffffff', border: '1px solid #e0e0e0',
        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: '12px', 
        flexDirection: 'column', gap: '8px', width: '180px', transform: 'translateX(-150px) translateY(-10px)' 
    });
    menuContainer.onmousedown = (e) => e.preventDefault(); 

    const hintText = document.createElement('div');
    hintText.innerHTML = `Profile: <strong>${profileHint}</strong>`;
    Object.assign(hintText.style, { fontSize: '12px', color: '#666', borderBottom: '1px solid #eee', paddingBottom: '8px' });

    const btnThis = document.createElement('button');
    btnThis.innerText = 'Autofill This';
    Object.assign(btnThis.style, { backgroundColor: '#2196F3', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
    btnThis.onclick = (e) => { e.stopPropagation(); removeBubble(); onAutofillThis(); };

    const btnAll = document.createElement('button');
    btnAll.innerText = 'Autofill All';
    Object.assign(btnAll.style, { backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #ddd', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
    btnAll.onclick = (e) => { e.stopPropagation(); removeBubble(); onAutofillAll(); };

    menuContainer.append(hintText, btnThis, btnAll);
    activeBubble.append(iconBtn, menuContainer);
    document.body.appendChild(activeBubble);

    attachDragEngine(iconBtn, menuContainer);

    currentBlurHandler = () => {
        setTimeout(() => {
            const currentFocus = document.activeElement as HTMLElement;
            if (currentFocus !== formElement && !isInsideBubble(currentFocus)) removeBubble();
        }, 150); 
    };
    formElement.addEventListener('blur', currentBlurHandler);
}

// ==========================================
// BUBBLE 2: THE RECORD BUBBLE
// ==========================================
export function renderRecordBubble(
    formElement: FormElement, 
    aliases: string[], 
    onSaveRecord: (value: string, isHardcoded: boolean) => void
) {
    removeBubble(); 
    currentFormElement = formElement; 

    const rect = formElement.getBoundingClientRect();
    const xPos = rect.right + window.scrollX - 28 - 8;
    const yPos = rect.top + window.scrollY + (rect.height / 2) - 14;

    activeBubble = document.createElement('div');
    activeBubble.id = 'contextual-autofill-bubble'; // Shared ID so click-detection works
    Object.assign(activeBubble.style, {
        position: 'absolute', left: `${xPos}px`, top: `${yPos}px`, 
        zIndex: '999999', fontFamily: 'system-ui, sans-serif'
    });

    const iconBtn = document.createElement('button');
    iconBtn.innerText = '🔴'; // Record indicator
    Object.assign(iconBtn.style, {
        width: '28px', height: '28px', borderRadius: '50%', backgroundColor: '#ff4444', 
        color: 'white', border: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', 
        cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', 
        padding: '0', fontSize: '10px', transition: 'transform 0.1s'
    });

    const menuContainer = document.createElement('div');
    Object.assign(menuContainer.style, {
        display: 'none', backgroundColor: '#ffffff', border: '1px solid #e0e0e0',
        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', padding: '12px', 
        flexDirection: 'column', gap: '8px', width: '180px', transform: 'translateX(-150px) translateY(-10px)' 
    });
    menuContainer.onmousedown = (e) => e.preventDefault(); // Prevents input blur when clicking the menu

    const title = document.createElement('div');
    title.innerHTML = `<strong>Map to Alias</strong>`;
    Object.assign(title.style, { fontSize: '12px', color: '#333', borderBottom: '1px solid #eee', paddingBottom: '4px' });

    // The Scrollable List Container
    const listContainer = document.createElement('div');
    Object.assign(listContainer.style, {
        display: 'flex', flexDirection: 'column', gap: '4px',
        maxHeight: '150px', overflowY: 'auto'
    });

    if (aliases.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.innerText = "No aliases found.";
        Object.assign(emptyMsg.style, { fontSize: '12px', color: '#999', fontStyle: 'italic', padding: '4px' });
        listContainer.appendChild(emptyMsg);
    } else {
        aliases.forEach(alias => {
            const btn = document.createElement('button');
            btn.innerText = alias;
            Object.assign(btn.style, {
                backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #ddd',
                padding: '6px', borderRadius: '4px', cursor: 'pointer', textAlign: 'left', fontSize: '12px'
            });
            
            // STRICT LOGIC: Clicking this button is the ONLY way to send isHardcoded = false
            btn.onclick = (e) => {
                e.stopPropagation();
                
                // 1. Inject the alias into the field
                formElement.value = alias;
                const eventName = formElement.tagName === 'INPUT' ? 'input' : 'change';
                formElement.dispatchEvent(new Event(eventName, { bubbles: true }));
                
                // 2. Destroy the bubble (this also removes the blur listener!)
                removeBubble(); 
                
                // 3. Fire the save callback telling the controller it is NOT hardcoded
                onSaveRecord(alias, false);
            };
            listContainer.appendChild(btn);
        });
    }

    menuContainer.append(title, listContainer);
    activeBubble.append(iconBtn, menuContainer);
    document.body.appendChild(activeBubble);

    attachDragEngine(iconBtn, menuContainer);

    // STRICT LOGIC: If they don't click a button, but click away or press tab, it is HARDCODED.
    currentBlurHandler = () => {
        setTimeout(() => {
            const currentFocus = document.activeElement as HTMLElement;
            if (currentFocus !== formElement && !isInsideBubble(currentFocus)) {
                
                const typedValue = formElement.value.trim();
                if (typedValue) {
                    onSaveRecord(typedValue, true); // Save what they typed as hardcoded
                } else {
                    formElement.style.backgroundColor = ""; // Clean up the yellow flash if they aborted
                }
                
                removeBubble();
            }
        }, 150); 
    };
    formElement.addEventListener('blur', currentBlurHandler);
}