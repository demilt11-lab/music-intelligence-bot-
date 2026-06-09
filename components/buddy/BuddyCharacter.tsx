'use client';

import { motion } from 'framer-motion';

/**
 * Buddy — the A&R office-assistant mascot.
 *
 * A friendly chibi music-office worker rendered as an animated SVG:
 * over-ear headphones, an "A&R" lanyard badge, and a clipboard with a tiny
 * trend chart. Idle animations (gentle float/breathe, blinking, floating music
 * notes, a pulsing headphone light) make it read as a living character that's
 * on the job rather than an abstract orb.
 */
export function BuddyCharacter({
  caption = 'Buddy is idle — awaiting your next assignment.',
  className,
}: {
  caption?: string;
  className?: string;
}) {
  return (
    <div className={`relative z-10 flex flex-col items-center ${className ?? ''}`}>
      <motion.div
        // whole-body idle float + breathe
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
        className="w-[230px] sm:w-[250px]"
      >
        <svg
          viewBox="0 0 260 360"
          className="h-auto w-full drop-shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
          role="img"
          aria-label="Buddy, the A&R office assistant, wearing headphones and holding a clipboard"
        >
          <defs>
            <linearGradient id="bd-skin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#F3C39B" />
              <stop offset="1" stopColor="#E2A271" />
            </linearGradient>
            <linearGradient id="bd-blazer" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#33455F" />
              <stop offset="1" stopColor="#212E42" />
            </linearGradient>
            <linearGradient id="bd-cup" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3C4554" />
              <stop offset="1" stopColor="#222833" />
            </linearGradient>
            <linearGradient id="bd-hair" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3A3742" />
              <stop offset="1" stopColor="#26242C" />
            </linearGradient>
            <radialGradient id="bd-aura" cx="50%" cy="45%" r="55%">
              <stop offset="0" stopColor="#34D399" stopOpacity="0.30" />
              <stop offset="1" stopColor="#34D399" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ground shadow */}
          <ellipse cx="130" cy="322" rx="78" ry="13" fill="#000000" opacity="0.45" />
          <motion.ellipse
            cx="130"
            cy="322"
            rx="64"
            ry="10"
            fill="#34D399"
            opacity="0.18"
            animate={{ opacity: [0.1, 0.22, 0.1], rx: [60, 66, 60] }}
            transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* soft "online" aura behind the head */}
          <circle cx="130" cy="98" r="74" fill="url(#bd-aura)" />

          {/* ── legs + shoes ───────────────────────────────────────────── */}
          <rect x="104" y="258" width="20" height="48" rx="9" fill="#2A3140" />
          <rect x="136" y="258" width="20" height="48" rx="9" fill="#2A3140" />
          <ellipse cx="112" cy="306" rx="17" ry="8" fill="#13161D" />
          <ellipse cx="148" cy="306" rx="17" ry="8" fill="#13161D" />

          {/* ── torso / blazer ─────────────────────────────────────────── */}
          <path
            d="M82,170 C82,156 102,148 130,148 C158,148 178,156 178,170 L184,250 C184,264 166,270 130,270 C94,270 76,264 76,250 Z"
            fill="url(#bd-blazer)"
          />
          {/* shirt V + collar */}
          <path d="M115,150 L130,180 L145,150 Z" fill="#EAEFF6" />
          <path d="M115,150 L130,180 L120,150 Z" fill="#33455F" />
          <path d="M145,150 L130,180 L140,150 Z" fill="#33455F" />

          {/* lanyard straps + A&R badge */}
          <path d="M116,156 L126,196" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
          <path d="M144,156 L134,196" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
          <rect x="116" y="194" width="28" height="24" rx="4" fill="#F5F7FB" />
          <rect x="116" y="194" width="28" height="8" rx="4" fill="#10B981" />
          <rect x="126" y="190" width="8" height="6" rx="2" fill="#8A8F99" />
          <text
            x="130"
            y="214"
            textAnchor="middle"
            fontSize="9"
            fontWeight="700"
            fill="#1F2937"
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            A&amp;R
          </text>

          {/* ── arms (sleeves) + hands holding the clipboard ───────────── */}
          <rect x="74" y="178" width="22" height="64" rx="11" fill="url(#bd-blazer)" />
          <rect x="164" y="178" width="22" height="64" rx="11" fill="url(#bd-blazer)" />
          {/* clipboard */}
          <rect x="96" y="206" width="68" height="58" rx="6" fill="#B17B3E" />
          <rect x="101" y="202" width="58" height="52" rx="3" fill="#F6F8FC" />
          <rect x="120" y="198" width="20" height="8" rx="2" fill="#8A8F99" />
          {/* clipboard content: text lines + a rising trend line (the "working" cue) */}
          <rect x="107" y="212" width="34" height="3" rx="1.5" fill="#C9D2DE" />
          <rect x="107" y="219" width="26" height="3" rx="1.5" fill="#C9D2DE" />
          <polyline
            points="107,244 119,238 131,241 143,229 153,232"
            fill="none"
            stroke="#10B981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="153" cy="232" r="2.4" fill="#34D399" />
          {/* hands */}
          <circle cx="98" cy="240" r="9" fill="url(#bd-skin)" />
          <circle cx="162" cy="240" r="9" fill="url(#bd-skin)" />

          {/* ── head ───────────────────────────────────────────────────── */}
          <circle cx="130" cy="98" r="60" fill="url(#bd-skin)" />
          {/* ears */}
          <circle cx="72" cy="106" r="12" fill="#E2A271" />
          <circle cx="188" cy="106" r="12" fill="#E2A271" />
          {/* hair */}
          <path
            d="M71,96 C68,52 96,30 130,30 C164,30 192,52 189,96 C176,74 158,64 130,64 C100,64 84,78 71,96 Z"
            fill="url(#bd-hair)"
          />
          {/* headphone band over the crown */}
          <path
            d="M62,104 C62,40 198,40 198,104"
            fill="none"
            stroke="#39414F"
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* eyes (blink) */}
          <motion.g
            style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
            animate={{ scaleY: [1, 1, 0.12, 1, 1] }}
            transition={{
              duration: 4.6,
              times: [0, 0.9, 0.94, 0.98, 1],
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <ellipse cx="111" cy="100" rx="10.5" ry="13" fill="#FFFFFF" />
            <ellipse cx="149" cy="100" rx="10.5" ry="13" fill="#FFFFFF" />
            <circle cx="113" cy="102" r="6" fill="#222B38" />
            <circle cx="147" cy="102" r="6" fill="#222B38" />
            <circle cx="111" cy="99" r="2.1" fill="#FFFFFF" />
            <circle cx="145" cy="99" r="2.1" fill="#FFFFFF" />
          </motion.g>

          {/* eyebrows */}
          <path d="M101,84 Q111,79 121,83" stroke="#2B2630" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M139,83 Q149,79 159,84" stroke="#2B2630" strokeWidth="3" strokeLinecap="round" fill="none" />
          {/* cheeks */}
          <ellipse cx="100" cy="120" rx="9" ry="5.5" fill="#F472B6" opacity="0.35" />
          <ellipse cx="160" cy="120" rx="9" ry="5.5" fill="#F472B6" opacity="0.35" />
          {/* smile */}
          <path d="M115,123 Q130,137 145,123" stroke="#7A4B2E" strokeWidth="3.2" strokeLinecap="round" fill="none" />

          {/* headphone ear-cups (front, over the ears) */}
          <rect x="46" y="86" width="32" height="48" rx="15" fill="url(#bd-cup)" />
          <rect x="182" y="86" width="32" height="48" rx="15" fill="url(#bd-cup)" />
          <circle cx="62" cy="110" r="8" fill="none" stroke="#34D399" strokeWidth="2" opacity="0.65" />
          <circle cx="198" cy="110" r="8" fill="none" stroke="#34D399" strokeWidth="2" opacity="0.65" />
          {/* pulsing power light on the cup */}
          <motion.circle
            cx="62"
            cy="110"
            r="3.2"
            fill="#6EE7B7"
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
          />
          <motion.circle
            cx="198"
            cy="110"
            r="3.2"
            fill="#6EE7B7"
            animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
            style={{ transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties}
          />

          {/* ── floating music notes ───────────────────────────────────── */}
          <FloatingNote x={206} y={120} delay={0} glyph="♪" />
          <FloatingNote x={40} y={150} delay={1.1} glyph="♫" />
          <FloatingNote x={196} y={190} delay={2.2} glyph="♩" />
        </svg>
      </motion.div>

      <div className="mt-1 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300">
        <motion.span
          className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        {caption}
      </div>
    </div>
  );
}

/** A single music note that drifts upward and fades, looping. */
function FloatingNote({
  x,
  y,
  delay,
  glyph,
}: {
  x: number;
  y: number;
  delay: number;
  glyph: string;
}) {
  return (
    <g transform={`translate(${x},${y})`}>
      <motion.text
        textAnchor="middle"
        fontSize="20"
        fill="#6EE7B7"
        animate={{ y: [0, -30], opacity: [0, 0.9, 0] }}
        transition={{ duration: 3.6, delay, repeat: Infinity, ease: 'easeOut' }}
      >
        {glyph}
      </motion.text>
    </g>
  );
}
