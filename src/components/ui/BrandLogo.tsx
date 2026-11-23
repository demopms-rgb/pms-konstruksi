import React from 'react';

export const BrandLogo: React.FC<{
  size?: 'sm' | 'md' | 'lg';
  subtitle?: string;
}> = ({ size = 'md', subtitle }) => {
  const iconDims = size === 'lg' ? 'w-12 h-12' : size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  const titleSize =
    size === 'lg' ? 'text-2xl leading-none' : size === 'sm' ? 'text-sm leading-none' : 'text-base leading-none';

  return (
    <div className="inline-flex items-center gap-3 select-none">
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={`${iconDims} shrink-0`}
        aria-hidden="true"
      >
        <path d="M8 38V18L14 14V38H8Z" fill="#FBBF24" />
        <path d="M17 38V10L24 6V38H17Z" fill="#F59E0B" />
        <path d="M27 38V14L33 18V38H27Z" fill="#FBBF24" />
        <path d="M36 38V23L41 26V38H36Z" fill="#FCD34D" />
        <path d="M6 34L42 20V24L6 38V34Z" fill="#0F1D35" opacity="0.35" />
        <rect x="5" y="38" width="38" height="3" rx="1.5" fill="#FBBF24" />
      </svg>
      <div className="text-left">
        <div className={`font-bold tracking-tight text-white ${titleSize}`}>
          <span className="block">PMS</span>
          <span className="block mt-0.5 tracking-wide">KONSTRUKSI</span>
        </div>
        {subtitle && <p className="text-xs text-slate-200 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
};
