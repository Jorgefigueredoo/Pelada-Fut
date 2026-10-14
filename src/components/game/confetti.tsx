const COLORS = [
  "oklch(0.72 0.18 150)",
  "oklch(0.82 0.16 85)",
  "oklch(0.7 0.17 25)",
  "oklch(0.7 0.14 240)",
  "oklch(0.96 0.02 100)",
];

const PIECES = Array.from({ length: 30 }, (_unused, index) => {
  const angle = (index / 30) * Math.PI * 2;
  const distance = 80 + ((index * 37) % 90);
  return {
    dx: Math.round(Math.cos(angle) * distance),
    dy: Math.round(Math.sin(angle) * distance - 50),
    rotation: ((index * 83) % 720) - 360,
    color: COLORS[index % COLORS.length],
    delay: (index % 6) * 25,
    round: index % 3 === 0,
  };
});

/**
 * A short burst from the middle of its parent, for the moment a player gets a slot.
 * Pure CSS, no library; mount it for a couple of seconds and unmount.
 */
export function Confetti() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex justify-center"
    >
      {PIECES.map((piece, index) => (
        <span
          key={index}
          className={`animate-confetti absolute block h-2.5 w-1.5 ${piece.round ? "rounded-full" : "rounded-[1px]"}`}
          style={
            {
              backgroundColor: piece.color,
              animationDelay: `${piece.delay}ms`,
              "--dx": `${piece.dx}px`,
              "--dy": `${piece.dy}px`,
              "--rot": `${piece.rotation}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
