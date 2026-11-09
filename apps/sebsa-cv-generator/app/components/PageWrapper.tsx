'use client';

import React from 'react';
import { motion } from 'motion/react';

interface PageWrapperProps {
  children: React.ReactNode;
  className?: string;
}

export const PageWrapper: React.FC<PageWrapperProps> = ({ children, className = '' }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`min-h-screen bg-[#fbf9fb] text-[#1b1b1d] font-sans ${className}`}
    >
      {children}
    </motion.div>
  );
};
