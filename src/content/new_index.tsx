import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Bubble } from './Bubble';
import { db } from '../db';

console.log("Tracer Bullet V4: Dynamic Mapping & Type Safety Active");

// --- 1. THE DOM COORDINATE GENERATOR ---
function getDomPath(el: HTMLElement | null): string {
  if (!el) return '';
  if (el.id) return `#${el.id}`;
  if (el.tagName === 'BODY') return 'BODY';
  let nth = 1;
  let sibling = el.previousElementSibling;
  while (sibling) {
    if (sibling.tagName === el.tagName) nth++;
    sibling = sibling.previousElementSibling;
  }
  return `${getDomPath(el.parentElement)} > ${el.tagName}:nth-of-type(${nth})`;
}

// --- 2. THE MAIN REACT CONTROLLER ---
const ContentApp = () => {
  const [bubbleState, setBubbleState] = useState({
    isVisible: false,
    x: 0,
    y: 0,
    activeCoordinate: '',
    activeInput: null as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null
  });

  useEffect(() => {
    const handleGlobalClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      
      // UPGRADE 1: Support all form field types, not just standard inputs
      const validTags = ['INPUT', 'TEXTAREA', 'SELECT'];
      if (!target || !validTags.includes(target.tagName)) {
        setBubbleState(prev => ({ ...prev, isVisible: false }));
        return;
      }

      // Cast it to a generic form element so TS knows it has a .value property
      const inputElement = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
      const exactCoordinate = getDomPath(inputElement);

      // ==========================================
      // ROUTE A: Dynamic "Record" Intent (Alt + Click)
      // ==========================================
      if (event.altKey) {
        event.preventDefault(); 
        
        // UPGRADE 2: Read the hardcoded text the user typed into the box!
        // If the box is empty, we default to "first_name" as a fallback.
        const mappedKey = inputElement.value.trim() || "first_name";
        
        chrome.storage.local.set({ [exactCoordinate]: mappedKey }, () => {
          inputElement.style.backgroundColor = "#fff59d"; // Flash Yellow
          console.log(`[RECORDED] ${exactCoordinate} -> mapped to profile key: "${mappedKey}"`);
          
          // Clear the box so it's empty and ready for you to test the Autofill!
          inputElement.value = ''; 
          
          setTimeout(() => inputElement.style.backgroundColor = "", 1000);
        });
        return; 
      }

      // ==========================================
      // ROUTE B (Part 1): Standard Click -> Open Bubble
      // ==========================================
      const rect = inputElement.getBoundingClientRect(); 
      setBubbleState({
        isVisible: true,
        x: rect.left + window.scrollX, 
        y: rect.bottom + window.scrollY + 8, 
        activeCoordinate: exactCoordinate,
        activeInput: inputElement
      });
    };

    document.addEventListener('click', handleGlobalClick, { capture: true });
    return () => document.removeEventListener('click', handleGlobalClick, { capture: true });
  }, []);

  // ==========================================
  // ROUTE B (Part 2): The "Autofill" Execution Engine
  // ==========================================
  const handleAutofill = () => {
    const input = bubbleState.activeInput;
    const coordinate = bubbleState.activeCoordinate;

    if (!coordinate || !input) return;

    chrome.storage.local.get(coordinate, async (result) => {
      const semanticKey = result[coordinate]; 
      
      if (semanticKey && typeof semanticKey === 'string') {
        const activeRow = await db.rows.where('searchIndex').equals('Alice').first();
        
        if (activeRow && activeRow.data) {
          const injectionValue = activeRow.data[semanticKey];

          if (injectionValue !== undefined) {
            
            // UPGRADE 3: HTML Input Type validation (TypeScript checks)
            // If the HTML expects a number, but the profile data is text (like "alice@test.com"), abort.
            if (input.tagName === 'INPUT') {
              const htmlType = (input as HTMLInputElement).type;
              if (htmlType === 'number' && isNaN(Number(injectionValue))) {
                console.error(`[TYPE ERROR] Cannot inject string "${injectionValue}" into <input type="number">`);
                return;
              }
            }

            input.value = String(injectionValue); 
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true })); // Added for Select dropdown support
            
            input.style.backgroundColor = "#b2dfdb"; // Flash Green!
            console.log(`[AUTOFILLED] Pulled "${injectionValue}" from Dexie NoSQL!`);
            setTimeout(() => input.style.backgroundColor = "", 1000);
            
            setBubbleState(prev => ({ ...prev, isVisible: false }));
          }
        }
      }
    });
  };

  return (
    <Bubble 
      x={bubbleState.x} 
      y={bubbleState.y} 
      isVisible={bubbleState.isVisible} 
      onAutofill={handleAutofill} 
    />
  );
};

// --- 3. THE SHADOW DOM BOOTSTRAPPER ---
const hostContainer = document.createElement('div');
hostContainer.id = 'contextual-autofill-extension-root';
document.body.appendChild(hostContainer);

const shadowRoot = hostContainer.attachShadow({ mode: 'open' });
const reactRoot = document.createElement('div');
shadowRoot.appendChild(reactRoot);

const root = createRoot(reactRoot);
root.render(<ContentApp />);