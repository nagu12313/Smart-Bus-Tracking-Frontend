import React from 'react';
import loadingGif from '../assets/loading.gif';

/**
 * Standard GIF Loading Spinner Core
 * Renders the user's authentic 2-dots loading.gif
 */
export function TwoDotsSpinnerCore({ width = 72, height = 'auto', style = {} }) {
  return (
    <img
      src={loadingGif}
      alt="Loading..."
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        display: 'inline-block',
        verticalAlign: 'middle',
        userSelect: 'none',
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
}

// Backward-compatibility alias
export const BusSpinnerCore = TwoDotsSpinnerCore;

/**
 * Global Loading Spinner
 * Disabled per user requirement: "remove global whole screen global spinner"
 */
export function GlobalSpinner() {
  return null;
}

/**
 * Container / Block Spinner
 * Used inside tables and dashboard panels — clean GIF spinner ONLY with NO TEXT.
 */
export function ContainerSpinner({ minHeight = '200px', width = 64 }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight,
        padding: '24px 16px',
        width: '100%',
      }}
    >
      <TwoDotsSpinnerCore width={width} />
    </div>
  );
}

/**
 * Inline Spinner for Buttons
 * Compact GIF inside buttons with NO TEXT.
 */
export function InlineSpinner({ width = 24 }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      <TwoDotsSpinnerCore width={width} />
    </span>
  );
}

export default GlobalSpinner;
