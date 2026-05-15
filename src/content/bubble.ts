export type FormElement = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

let activeBubble: HTMLElement | null = null;
let currentBlurHandler: ((e: FocusEvent) => void) | null = null;
let currentFormElement: FormElement | null = null;

export function removeBubble() {
    if (activeBubble) {
        activeBubble.remove();
        activeBubble = null;
    }
    // Clean up the blur listener so we don't cause memory leaks
    if (currentFormElement && currentBlurHandler) {
        currentFormElement.removeEventListener('blur', currentBlurHandler);
        currentBlurHandler = null;
        currentFormElement = null;
    }
}

export function isInsideBubble(target: HTMLElement): boolean {
    return target.closest('#contextual-autofill-bubble') !== null;
}

export function renderBubble(
    formElement: FormElement, 
    profileHint: string, 
    onAutofillThis: () => void, 
    onAutofillAll: () => void
) {
    removeBubble(); // Clear any existing bubble first
    currentFormElement = formElement; // Save reference for cleanup

    // 1. Calculate precise positioning
    const rect = formElement.getBoundingClientRect();
    const bubbleSize = 28;
    const paddingRight = 8;
    const xPos = rect.right + window.scrollX - bubbleSize - paddingRight;
    const yPos = rect.top + window.scrollY + (rect.height / 2) - (bubbleSize / 2);

    // 2. Create the container
    activeBubble = document.createElement('div');
    activeBubble.id = 'contextual-autofill-bubble';
    activeBubble.style.position = 'absolute';
    activeBubble.style.left = `${xPos}px`;
    activeBubble.style.top = `${yPos}px`;
    activeBubble.style.zIndex = '999999';
    activeBubble.style.fontFamily = 'system-ui, sans-serif';

    // 3. Create the Tiny Lightning Icon (Default State)
    const iconBtn = document.createElement('button');
    iconBtn.innerText = '⚡';
    Object.assign(iconBtn.style, {
        width: '28px', height: '28px', borderRadius: '50%',
        backgroundColor: '#2196F3', color: 'white', border: 'none',
        boxShadow: '0 2px 6px rgba(0,0,0,0.2)', cursor: 'pointer',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        padding: '0', fontSize: '14px', transition: 'transform 0.1s'
    });
    iconBtn.onmouseenter = () => iconBtn.style.transform = 'scale(1.1)';
    iconBtn.onmouseleave = () => iconBtn.style.transform = 'scale(1)';

    // ==========================================
    // THE DRAGGING ENGINE
    // ==========================================
    let isDragging = false;
    let hasDragged = false;
    let startMouseX = 0;
    let startMouseY = 0;
    let startBubbleX = 0;
    let startBubbleY = 0;

    iconBtn.onmousedown = (e) => {
        e.preventDefault(); // CRITICAL: Stops the input from blurring while dragging
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

            // 3-pixel forgiveness threshold to differentiate a click from a drag
            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                hasDragged = true;
            }

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

    // Interaction Logic: Click vs Drag
    iconBtn.onclick = (e) => {
        e.stopPropagation(); 
        
        if (hasDragged) {
            hasDragged = false; 
            return; 
        }

        iconBtn.style.display = 'none'; 
        menuContainer.style.display = 'flex'; 
    };

    // 4. Create the Expanded Menu (Hidden by default)
    const menuContainer = document.createElement('div');
    Object.assign(menuContainer.style, {
        display: 'none', 
        backgroundColor: '#ffffff', border: '1px solid #e0e0e0',
        borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
        padding: '12px', flexDirection: 'column', gap: '8px', width: '180px',
        transform: 'translateX(-150px) translateY(-10px)' 
    });

    // CRITICAL FIX: Prevent the menu background from stealing focus
    menuContainer.onmousedown = (e) => {
        e.preventDefault(); 
    };

    // Menu Content: Hint
    const hintText = document.createElement('div');
    hintText.innerHTML = `Profile: <strong>${profileHint}</strong>`;
    Object.assign(hintText.style, { fontSize: '12px', color: '#666', borderBottom: '1px solid #eee', paddingBottom: '8px' });

    // Menu Content: Autofill This
    const btnThis = document.createElement('button');
    btnThis.innerText = 'Autofill This';
    Object.assign(btnThis.style, { backgroundColor: '#2196F3', color: 'white', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
    btnThis.onclick = (e) => {
        e.stopPropagation(); 
        removeBubble(); 
        onAutofillThis(); 
    };

    // Menu Content: Autofill All 
    const btnAll = document.createElement('button');
    btnAll.innerText = 'Autofill All';
    Object.assign(btnAll.style, { backgroundColor: '#f5f5f5', color: '#333', border: '1px solid #ddd', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' });
    btnAll.onclick = (e) => {
        e.stopPropagation();
        removeBubble();
        onAutofillAll(); 
    };

    // 5. Assemble the DOM Nodes
    menuContainer.appendChild(hintText);
    menuContainer.appendChild(btnThis);
    menuContainer.appendChild(btnAll);

    activeBubble.appendChild(iconBtn);
    activeBubble.appendChild(menuContainer);
    document.body.appendChild(activeBubble);

    // ==========================================
    // BULLETPROOF BLUR HANDLER
    // ==========================================
    currentBlurHandler = () => {
        setTimeout(() => {
            const currentFocus = document.activeElement as HTMLElement;
            
            // If the user tabbed away or clicked somewhere else entirely
            if (currentFocus !== formElement && !isInsideBubble(currentFocus)) {
                removeBubble();
            }
        }, 150); 
    };

    formElement.addEventListener('blur', currentBlurHandler);
}