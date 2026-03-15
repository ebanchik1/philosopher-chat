"use client";
import { useState, useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { ArrowRight, Link, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TimelineItem {
  id: number;
  title: string;
  date: string;
  content: string;
  category: string;
  icon: React.ElementType;
  relatedIds: number[];
  status: "completed" | "in-progress" | "pending";
  energy: number;
  image?: string;
  philosopherId?: string;
}

interface RadialOrbitalTimelineProps {
  timelineData: TimelineItem[];
  onNodeClick?: (philosopherId: string) => void;
}

export default function RadialOrbitalTimeline({
  timelineData,
  onNodeClick,
}: RadialOrbitalTimelineProps) {
  const [expandedItems, setExpandedItems] = useState<Record<number, boolean>>(
    {}
  );
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [autoRotate, setAutoRotate] = useState<boolean>(true);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [pulseEffect, setPulseEffect] = useState<Record<number, boolean>>({});
  const [centerOffset] = useState<{ x: number; y: number }>({
    x: 0,
    y: 0,
  });
  const [orbitRadius, setOrbitRadius] = useState<number>(200);
  const [orbitCenterY, setOrbitCenterY] = useState<number>(400);
  const [activeNodeId, setActiveNodeId] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Record<number, HTMLDivElement | null>>({});

  // Responsive radius + center calculation
  const computeLayout = useCallback(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const titleHeight = w < 640 ? 100 : 120;
    const bottomPad = 50;
    const nodeOverflow = w < 640 ? 90 : 70;
    const availableH = h - titleHeight - bottomPad - nodeOverflow * 2;
    const availableW = w - nodeOverflow * 2;
    const maxByHeight = availableH / 2;
    const maxByWidth = availableW / 2;
    const radius = Math.max(90, Math.min(maxByHeight, maxByWidth, 260));
    // Center of orbit in viewport coordinates
    const centerY = titleHeight + nodeOverflow + radius;
    return { radius, centerY };
  }, []);

  // Set layout on mount synchronously to avoid flash
  useLayoutEffect(() => {
    const { radius, centerY } = computeLayout();
    setOrbitRadius(radius);
    setOrbitCenterY(centerY);
  }, [computeLayout]);

  // Debounced resize handler
  useEffect(() => {
    let rafId: number;
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        const { radius, centerY } = computeLayout();
        setOrbitRadius(radius);
        setOrbitCenterY(centerY);
      });
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(rafId);
    };
  }, [computeLayout]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === containerRef.current || e.target === orbitRef.current) {
      setExpandedItems({});
      setActiveNodeId(null);
      setPulseEffect({});
      setAutoRotate(true);
    }
  };

  const toggleItem = (id: number) => {
    setExpandedItems((prev) => {
      const newState = { ...prev };
      Object.keys(newState).forEach((key) => {
        if (parseInt(key) !== id) {
          newState[parseInt(key)] = false;
        }
      });
      newState[id] = !prev[id];

      if (!prev[id]) {
        setActiveNodeId(id);
        setAutoRotate(false);
        const relatedItems = getRelatedItems(id);
        const newPulseEffect: Record<number, boolean> = {};
        relatedItems.forEach((relId) => {
          newPulseEffect[relId] = true;
        });
        setPulseEffect(newPulseEffect);
        centerViewOnNode(id);
      } else {
        setActiveNodeId(null);
        setAutoRotate(true);
        setPulseEffect({});
      }

      return newState;
    });
  };

  // Pause rotation on hover OR when a card is expanded
  const shouldRotate = autoRotate && hoveredNodeId === null;

  // Use requestAnimationFrame for smooth 60fps rotation
  const angleRef = useRef(rotationAngle);
  const lastFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!shouldRotate) return;
    let rafId: number;
    const animate = (timestamp: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const delta = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;
      // ~6 degrees per second (smooth, consistent speed regardless of frame rate)
      angleRef.current = (angleRef.current + delta * 0.006) % 360;
      setRotationAngle(angleRef.current);
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(rafId);
      lastFrameRef.current = 0;
    };
  }, [shouldRotate]);

  const centerViewOnNode = (nodeId: number) => {
    if (!nodeRefs.current[nodeId]) return;
    const nodeIndex = timelineData.findIndex((item) => item.id === nodeId);
    const totalNodes = timelineData.length;
    const targetAngle = (nodeIndex / totalNodes) * 360;
    const newAngle = 270 - targetAngle;
    angleRef.current = newAngle;
    setRotationAngle(newAngle);
  };

  const calculateNodePosition = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotationAngle) % 360;
    const radian = (angle * Math.PI) / 180;
    const x = orbitRadius * Math.cos(radian) + centerOffset.x;
    const y = orbitRadius * Math.sin(radian) + centerOffset.y;
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(
      0.4,
      Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2))
    );
    return { x, y, angle, zIndex, opacity };
  };

  const getRelatedItems = (itemId: number): number[] => {
    const currentItem = timelineData.find((item) => item.id === itemId);
    return currentItem ? currentItem.relatedIds : [];
  };

  const isRelatedToActive = (itemId: number): boolean => {
    if (!activeNodeId) return false;
    const relatedItems = getRelatedItems(activeNodeId);
    return relatedItems.includes(itemId);
  };

  const getStatusStyles = (status: TimelineItem["status"]): string => {
    switch (status) {
      case "completed":
        return "text-white bg-black border-white";
      case "in-progress":
        return "text-black bg-white border-black";
      case "pending":
        return "text-white bg-black/40 border-white/50";
      default:
        return "text-white bg-black/40 border-white/50";
    }
  };

  // Orbit ring size matches radius
  const orbitDiameter = orbitRadius * 2;

  return (
    <div
      className="w-full h-screen flex flex-col items-center bg-black overflow-hidden"
      ref={containerRef}
      onClick={handleContainerClick}
    >
      {/* Title — in flow, not absolute, so it never overlaps */}
      <div className="flex-shrink-0 z-50 text-center pt-6 pb-2 sm:pt-8 sm:pb-4 pointer-events-none">
        <div className="text-4xl sm:text-5xl font-serif text-amber-200/80 mb-1" style={{ fontFamily: 'Cormorant Garamond, serif' }}>&Phi;</div>
        <h1 className="text-xl sm:text-2xl font-serif tracking-wide text-white/90" style={{ fontFamily: 'Cormorant Garamond, serif' }}>Philosophia</h1>
        <p className="text-[10px] sm:text-xs tracking-widest uppercase text-white/40 mt-1" style={{ fontFamily: 'DM Sans, sans-serif' }}>Dialogues with Great Thinkers</p>
      </div>

      <div
        className="absolute inset-0"
        ref={orbitRef}
        style={{ perspective: "1000px" }}
      >
          {/* Center orb */}
          <div className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-amber-600 via-amber-500 to-yellow-400 animate-pulse flex items-center justify-center z-10"
            style={{ top: `${orbitCenterY}px`, left: '50%', transform: 'translate(-50%, -50%)' }}
          >
            <div className="absolute w-20 h-20 rounded-full border border-amber-300/20 animate-ping opacity-70"></div>
            <div
              className="absolute w-24 h-24 rounded-full border border-amber-200/10 animate-ping opacity-50"
              style={{ animationDelay: "0.5s" }}
            ></div>
            <div className="w-8 h-8 rounded-full bg-amber-100/80 backdrop-blur-md"></div>
          </div>

          {/* Orbit ring — responsive */}
          <div
            className="absolute rounded-full border border-white/10"
            style={{
              width: `${orbitDiameter}px`,
              height: `${orbitDiameter}px`,
              top: `${orbitCenterY}px`,
              left: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          ></div>

          {/* Nodes */}
          {timelineData.map((item, index) => {
            const position = calculateNodePosition(index, timelineData.length);
            const isExpanded = expandedItems[item.id];
            const isRelated = isRelatedToActive(item.id);
            const isPulsing = pulseEffect[item.id];
            const isHovered = hoveredNodeId === item.id;
            const Icon = item.icon;
            const isSmallScreen = orbitRadius < 130;
            const baseSize = isSmallScreen ? 36 : 48;
            const hoverSize = isSmallScreen ? 48 : 64;
            const expandSize = isSmallScreen ? 56 : 72;
            const nodeStyle = {
              transform: `translate(${position.x}px, ${position.y}px)`,
              zIndex: isExpanded ? 200 : isHovered ? 190 : position.zIndex,
              opacity: isExpanded || isHovered ? 1 : position.opacity,
            };

            return (
              <div
                key={item.id}
                ref={(el) => { nodeRefs.current[item.id] = el; }}
                className="absolute cursor-pointer"
                style={{
                  top: `${orbitCenterY}px`,
                  left: '50%',
                  transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
                  zIndex: isExpanded ? 200 : isHovered ? 190 : position.zIndex,
                  opacity: isExpanded || isHovered ? 1 : position.opacity,
                  transition: 'opacity 0.3s ease',
                  willChange: 'transform',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleItem(item.id);
                }}
                onMouseEnter={() => setHoveredNodeId(item.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
              >
                {/* Energy glow */}
                <div
                  className={`absolute rounded-full -inset-1 ${
                    isPulsing ? "animate-pulse duration-1000" : ""
                  }`}
                  style={{
                    background: `radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%)`,
                    width: `${item.energy * 0.5 + 40}px`,
                    height: `${item.energy * 0.5 + 40}px`,
                    left: `-${(item.energy * 0.5 + 40 - 40) / 2}px`,
                    top: `-${(item.energy * 0.5 + 40 - 40) / 2}px`,
                  }}
                ></div>

                {/* Node circle — philosopher portrait or icon */}
                {item.image ? (
                  <div
                    className={`
                    rounded-full overflow-hidden
                    border-2
                    ${
                      isExpanded
                        ? "border-amber-400 shadow-lg shadow-amber-400/30"
                        : isHovered
                        ? "border-amber-300 shadow-md shadow-amber-300/20"
                        : isRelated
                        ? "border-white animate-pulse"
                        : "border-white/40"
                    }
                    transition-all duration-300 transform
                  `}
                    style={{
                      width: `${isExpanded ? expandSize : isHovered ? hoverSize : baseSize}px`,
                      height: `${isExpanded ? expandSize : isHovered ? hoverSize : baseSize}px`,
                      marginLeft: `${isExpanded ? -(expandSize - baseSize) / 2 : isHovered ? -(hoverSize - baseSize) / 2 : 0}px`,
                      marginTop: `${isExpanded ? -(expandSize - baseSize) / 2 : isHovered ? -(hoverSize - baseSize) / 2 : 0}px`,
                      filter: isExpanded || isHovered ? 'none' : 'grayscale(70%)',
                    }}
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  </div>
                ) : (
                  <div
                    className={`
                    w-10 h-10 rounded-full flex items-center justify-center
                    ${
                      isExpanded
                        ? "bg-white text-black"
                        : isRelated
                        ? "bg-white/50 text-black"
                        : "bg-black text-white"
                    }
                    border-2
                    ${
                      isExpanded
                        ? "border-white shadow-lg shadow-white/30"
                        : isRelated
                        ? "border-white animate-pulse"
                        : "border-white/40"
                    }
                    transition-all duration-300 transform
                    ${isExpanded ? "scale-150" : isHovered ? "scale-125" : ""}
                  `}
                  >
                    <Icon size={16} />
                  </div>
                )}

                {/* Label */}
                <div
                  className={`
                  absolute left-1/2 -translate-x-1/2 whitespace-nowrap
                  font-semibold tracking-wider
                  transition-all duration-300
                  ${isExpanded
                    ? "text-amber-200 text-sm"
                    : isHovered
                    ? "text-amber-100 text-sm"
                    : "text-white/70 text-xs"
                  }
                `}
                  style={{
                    fontFamily: 'Cormorant Garamond, serif',
                    top: isExpanded
                      ? `${expandSize + 8}px`
                      : isHovered
                      ? `${hoverSize + 8}px`
                      : `${baseSize + 8}px`,
                    fontSize: isSmallScreen && !isExpanded && !isHovered ? '10px' : undefined,
                  }}
                >
                  {item.title}
                </div>

                {/* Expanded card — rendered via portal below */}
              </div>
            );
          })}
        </div>

      {/* Expanded card overlay — fixed to viewport center so it never clips */}
      {(() => {
        const expandedItem = timelineData.find((item) => expandedItems[item.id]);
        if (!expandedItem) return null;
        return (
          <div
            className="fixed inset-0 z-[300] flex items-center justify-center pointer-events-none"
            style={{ paddingTop: '80px' }}
          >
            <div
              className="pointer-events-auto bg-black/95 backdrop-blur-xl border border-amber-400/30 rounded-xl shadow-2xl shadow-amber-400/10 overflow-y-auto"
              style={{ width: '380px', maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 120px)', padding: '32px' }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Badge + Date */}
              <div className="flex justify-between items-center">
                <Badge
                  className={`text-sm ${getStatusStyles(expandedItem.status)}`}
                  style={{ padding: '10px 20px' }}
                >
                  {expandedItem.category}
                </Badge>
                <span className="text-xs font-mono text-white/50">
                  {expandedItem.date}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-xl font-semibold text-white" style={{ fontFamily: 'Cormorant Garamond, serif', marginTop: '20px' }}>
                {expandedItem.title}
              </h3>

              {/* Description */}
              <p className="text-sm text-white/75" style={{ fontFamily: 'Newsreader, serif', lineHeight: '1.85', marginTop: '16px' }}>
                {expandedItem.content}
              </p>

              {/* Influence meter */}
              <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="flex justify-between items-center text-xs text-white/80" style={{ marginBottom: '12px' }}>
                  <span className="flex items-center gap-2">
                    <Zap size={13} />
                    Influence
                  </span>
                  <span className="font-mono">{expandedItem.energy}%</span>
                </div>
                <div className="w-full bg-white/10 rounded-full overflow-hidden" style={{ height: '6px' }}>
                  <div
                    className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full"
                    style={{ width: `${expandedItem.energy}%` }}
                  ></div>
                </div>
              </div>

              {/* Connected philosophers */}
              {expandedItem.relatedIds.length > 0 && (
                <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: '16px' }}>
                    <Link size={13} className="text-white/70" />
                    <h4 className="text-xs uppercase tracking-wider font-medium text-white/70">
                      Connected Thinkers
                    </h4>
                  </div>
                  <div className="flex flex-wrap" style={{ gap: '10px' }}>
                    {expandedItem.relatedIds.map((relatedId) => {
                      const relatedItem = timelineData.find(
                        (i) => i.id === relatedId
                      );
                      return (
                        <Button
                          key={relatedId}
                          variant="outline"
                          size="sm"
                          className="flex items-center text-xs rounded-sm border-white/20 bg-transparent hover:bg-white/10 text-white/80 hover:text-white transition-all"
                          style={{ height: '38px', padding: '0 18px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleItem(relatedId);
                          }}
                        >
                          {relatedItem?.title}
                          <ArrowRight size={10} className="ml-2 text-white/60" />
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Begin dialogue button */}
              {expandedItem.philosopherId && onNodeClick && (
                <div style={{ marginTop: '28px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-sm border-amber-400/40 text-amber-200 hover:bg-amber-400/10 hover:text-amber-100"
                    style={{ height: '46px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onNodeClick(expandedItem.philosopherId!);
                    }}
                  >
                    Begin Dialogue
                    <ArrowRight size={15} className="ml-2" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Bottom hint */}
      <div className="absolute bottom-6 z-50 text-center pointer-events-none">
        <p className="text-xs text-white/30" style={{ fontFamily: 'DM Sans, sans-serif' }}>Click a philosopher to explore &middot; Click again to close</p>
      </div>
    </div>
  );
}

export type { TimelineItem };
