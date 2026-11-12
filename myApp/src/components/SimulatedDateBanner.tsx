import React from 'react';
import { simulatedNow } from '../services/simulatedClock';
import './SimulatedDateBanner.css';

/**
 * A strip across the top while demo time travel is on, so nobody mistakes the
 * simulated date for the real one. Shows nothing otherwise.
 */
const SimulatedDateBanner: React.FC = () => {
  const now = simulatedNow();
  if (!now) return null;

  return (
    <div className="simulated-date-banner" role="status">
      <strong>Demo simulation</strong>
      <span>Today is treated as {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</span>
    </div>
  );
};

export default SimulatedDateBanner;
