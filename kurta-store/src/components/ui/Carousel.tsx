'use client';

import { useCallback, useEffect, useState, type ReactNode, type CSSProperties } from 'react';
import useEmblaCarousel from 'embla-carousel-react';

interface CarouselProps {
  children: ReactNode[];
  /** CSS width per slide, e.g. '72%', '82%', 'calc(50% - 8px)'. */
  slideWidth: string;
  gap?: number;
  showDots?: boolean;
  ariaLabel: string;
  className?: string;
}

export function Carousel({ children, slideWidth, gap = 16, showDots = true, ariaLabel, className }: CarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'start',
    containScroll: 'trimSnaps',
    dragFree: false,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setScrollSnaps(emblaApi.scrollSnapList());
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  const dotStyle = (active: boolean): CSSProperties => ({
    width: active ? '20px' : '6px',
    height: '6px',
    borderRadius: '100px',
    border: 'none',
    backgroundColor: active ? '#8C6F63' : '#E6E2D8',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    padding: 0,
  });

  return (
    <div className={className}>
      <div ref={emblaRef} style={{ overflow: 'hidden' }} role="region" aria-roledescription="carousel" aria-label={ariaLabel}>
        <div style={{ display: 'flex', gap: `${gap}px` }}>
          {children.map((child, i) => (
            <div key={i} style={{ flex: `0 0 ${slideWidth}`, minWidth: 0 }}>{child}</div>
          ))}
        </div>
      </div>
      {showDots && scrollSnaps.length > 1 && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '20px' }}>
          {scrollSnaps.map((_, i) => (
            <button
              key={i}
              onClick={() => emblaApi?.scrollTo(i)}
              style={dotStyle(i === selectedIndex)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
