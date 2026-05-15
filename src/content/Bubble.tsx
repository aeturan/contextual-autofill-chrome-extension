import React from 'react';

// Define the properties our bubble needs to know
interface BubbleProps {
  x: number;
  y: number;
  isVisible: boolean;
  onAutofill: () => void;
}

export const Bubble: React.FC<BubbleProps> = ({ x, y, isVisible, onAutofill }) => {
  if (!isVisible) return null;

  return (
    <div style={{
      position: 'absolute',
      top: `${y}px`,
      left: `${x}px`,
      zIndex: 999999, // Ensure we are on top of everything
      backgroundColor: '#ffffff',
      border: '1px solid #e0e0e0',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      padding: '12px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ fontSize: '12px', color: '#666' }}>
        Using: <strong>Alice (Dummy.csv)</strong> ⚙️
      </div>
      <button 
        onClick={onAutofill}
        style={{
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          padding: '6px 12px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontWeight: 'bold'
      }}>
        Autofill Field
      </button>
    </div>
  );
};