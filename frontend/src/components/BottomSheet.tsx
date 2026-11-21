import React, { useEffect, useState, useRef } from 'react';

export interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = '',
}) => {
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Lock background / body scrolling when open
  useEffect(() => {
    if (!isOpen) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const originalTouchAction = document.body.style.touchAction;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      document.body.style.touchAction = originalTouchAction;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Touch gesture handlers for drag down
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only allow drag-down initiation from top or if content is at top
    if (sheetRef.current && sheetRef.current.scrollTop > 0) return;
    startYRef.current = e.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (startYRef.current === null) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startYRef.current;
    if (diff > 0) {
      setDragY(diff);
    } else {
      setDragY(0);
    }
  };

  const handleTouchEnd = () => {
    if (startYRef.current === null) return;
    if (dragY > 75) {
      onClose();
    }
    setDragY(0);
    setIsDragging(false);
    startYRef.current = null;
  };

  // Mouse drag handlers for desktop preview / testing
  const handleMouseDown = (e: React.MouseEvent) => {
    startYRef.current = e.clientY;
    setIsDragging(true);

    const onMouseMove = (ev: MouseEvent) => {
      if (startYRef.current === null) return;
      const diff = ev.clientY - startYRef.current;
      if (diff > 0) {
        setDragY(diff);
      } else {
        setDragY(0);
      }
    };

    const onMouseUp = (ev: MouseEvent) => {
      if (startYRef.current !== null) {
        const diff = ev.clientY - startYRef.current;
        if (diff > 75) {
          onClose();
        }
      }
      setDragY(0);
      setIsDragging(false);
      startYRef.current = null;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (!isOpen) return null;

  return (
    <div
      className="sheet-backdrop animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Bottom sheet dialog'}
    >
      <div
        ref={sheetRef}
        className={`sheet-content ${isDragging ? '' : 'animate-slideUp'} ${className}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1)',
        }}
      >
        {/* Grab Handle Header - Draggable on both touch and mouse */}
        <div
          className="grab-handle-container"
          aria-hidden="true"
          onMouseDown={handleMouseDown}
          onClick={onClose}
        >
          <div className="grab-handle" />
        </div>
        {children}
      </div>
    </div>
  );
};
