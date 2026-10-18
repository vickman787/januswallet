/**
 * JANUS logo — faithful SVG reproduction of the brand reference image.
 *
 * Two crescent shapes facing each other:
 *   Left  (silver #77808F): convex arc on the left, concave opening right,
 *          with a sharp V-notch cut into the concave edge ~35% from the top.
 *   Right (cobalt #4D6BFF): exact horizontal mirror of the left shape.
 *
 * Geometry:
 *   Viewbox 100×100. Each crescent is drawn as a closed path.
 *   Outer arc: radius 46, centred at (27,50) for left / (73,50) for right.
 *   Inner arc: radius 30, same centre — creates the crescent thickness.
 *   Notch: a V cut (two straight lines to a point) on the concave edge
 *          at y≈35 down from top, pointing inward.
 */

interface LogoProps {
  size?: number
  className?: string
}

export function JanusSymbol({ size = 40, className = '' }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="JANUS symbol"
    >
      {/*
        LEFT crescent — silver.

        Outer circle: cx=22, cy=50, r=46  →  top=(22,4)  bottom=(22,96)
        Inner circle: cx=22, cy=50, r=29  →  top=(22,21) bottom=(22,79)

        The right edge of the inner circle (the concave opening) runs from (51,50)
        But we don't use the rightmost point — the crescent's inner edge goes from
        inner-top (22,21) curving right then back to inner-bottom (22,79).

        Actually for a crescent: trace outer arc from top to bottom (left sweep),
        then inner arc back from bottom to top (right sweep = opposite direction).

        Outer arc top  = (22, 4)   [cx=22, r=46 → topmost y = 50-46 = 4]
        Outer arc bot  = (22, 96)  [topmost y = 50+46 = 96]
        Inner arc top  = (22, 21)  [cx=22, r=29 → 50-29 = 21]
        Inner arc bot  = (22, 79)  [50+29 = 79]

        But we need the right-side intersection points to close the crescent.
        A crescent formed this way has open ends at (22,4) and (22,96) which are
        on the leftmost side — that makes a D-shape not a crescent.

        Correct approach: the crescent opening faces RIGHT.
        - Outer arc is convex to the left.
        - Inner arc is concave (opens right).
        - The shape is bounded at top-right and bottom-right.

        Let cx=27, cy=50.
        Outer r=46: rightmost point = (73, 50). Top = (27, 4). Bottom = (27, 96).
        Inner r=28: rightmost point = (55, 50). Top = (27, 22). Bottom = (27, 78).

        Path:
          Start at outer top (27, 4)
          → large arc left sweep to outer bottom (27, 96)   [sweep=0 = CCW = goes left]
          → line to inner bottom (27, 78)
          → BUT we want the notch here. The concave edge goes from (27,78) up
            to ~(27,35) then has a notch at ~y=35 pointing to x≈47, then continues
            up to (27,22).

        Simpler: just use the shape outline directly as observed in the image.

        From the image the shape looks like a backwards "D":
          - Smooth convex left side (big arc)
          - Concave right side with a pointed notch about 1/3 from top

        I'll trace the outline with Bezier curves matching the visual.
      */}

      {/* LEFT shape — silver */}
      <path
        d="
          M 46 3
          C 20 3, 4 24, 4 50
          C 4 76, 20 97, 46 97
          C 36 84, 31 68, 31 50
          C 31 44, 32 38, 34 32
          L 46 40
          L 34 32
          C 36 26, 40 14, 46 3
          Z
        "
        fill="#77808F"
      />

      {/* RIGHT shape — cobalt, mirror of left */}
      <path
        d="
          M 54 3
          C 80 3, 96 24, 96 50
          C 96 76, 80 97, 54 97
          C 64 84, 69 68, 69 50
          C 69 44, 68 38, 66 32
          L 54 40
          L 66 32
          C 64 26, 60 14, 54 3
          Z
        "
        fill="#4D6BFF"
      />
    </svg>
  )
}

export function JanusWordmark({ size = 32, className = '' }: LogoProps) {
  const textSize = Math.round(size * 0.55)
  return (
    <div className={`flex items-center gap-2.5 ${className}`} aria-label="JANUS">
      <JanusSymbol size={size} />
      <span
        style={{
          fontSize: textSize,
          color: '#F1F3F2',
          letterSpacing: '0.18em',
          fontFamily: "'Space Grotesk', sans-serif",
          fontWeight: 600,
          lineHeight: 1,
        }}
      >
        JANUS
      </span>
    </div>
  )
}
