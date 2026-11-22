import React from 'react';

/** Three pulsing dots (eggplant, green, amber). Doop component "AiSparkle". */
export const AiSparkle: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`ca-sp ${className}`} aria-hidden="true">
    <i />
    <i />
    <i />
  </span>
);
