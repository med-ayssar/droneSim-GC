import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'outline' | 'success' | 'destructive' | 'warning' | 'purple' | 'cyan';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'default',
  className = '',
  children,
  ...props
}) => {
  const variantStyles = {
    default: 'bg-slate-900 text-slate-300 border-slate-700',
    outline: 'bg-transparent text-cyan-400 border-cyan-500/40',
    success: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
    destructive: 'bg-rose-950/80 text-rose-400 border-rose-500/50 shadow-[0_0_10px_rgba(244,63,94,0.2)]',
    warning: 'bg-amber-950/80 text-amber-400 border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
    purple: 'bg-purple-950/80 text-purple-400 border-purple-500/50',
    cyan: 'bg-cyan-950/80 text-cyan-300 border-cyan-500/50 shadow-[0_0_10px_rgba(6,182,212,0.2)]',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase tracking-wider border ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
