'use client';

import { motion, MotionConfig } from 'framer-motion';

const EQ_BARS = [
  { x: 345, color: '#34D399', dur: 0.9, keys: [0.4, 1, 0.55, 0.85, 0.4] },
  { x: 355, color: '#34D399', dur: 1.2, keys: [1, 0.5, 0.9, 0.45, 1] },
  { x: 365, color: '#6EE7B7', dur: 0.8, keys: [0.6, 1, 0.4, 0.8, 0.6] },
  { x: 375, color: '#34D399', dur: 1.4, keys: [0.9, 0.4, 1, 0.6, 0.9] },
  { x: 385, color: '#6EE7B7', dur: 1.0, keys: [0.5, 0.9, 0.55, 1, 0.5] },
  { x: 395, color: '#34D399', dur: 1.3, keys: [1, 0.6, 0.85, 0.45, 1] },
  { x: 405, color: '#6EE7B7', dur: 0.95, keys: [0.45, 0.8, 1, 0.55, 0.45] },
];

const pivotBottom = { transformBox: 'fill-box', transformOrigin: 'bottom' } as React.CSSProperties;
const pivotCenter = { transformBox: 'fill-box', transformOrigin: 'center' } as React.CSSProperties;

/**
 * Buddy — the A&R office-assistant mascot, in his music-industry office.
 *
 * A friendly chibi office worker (over-ear headphones, "A&R" lanyard badge,
 * clipboard with a trend chart) standing in a full office scene: a night-skyline
 * window, framed gold & platinum records, a vinyl shelf with a trophy, a plant,
 * and a desk with a monitor running a live audio equalizer, a studio speaker,
 * a coffee mug, and a lamp.
 *
 * Animated (client-side): idle float/breathe, blinking, pulsing headphone light,
 * drifting music notes, and the equalizer bars on the monitor.
 */
export function BuddyCharacter({
  caption = 'Buddy is idle — awaiting your next assignment.',
  className,
}: {
  caption?: string;
  className?: string;
}) {
  return (
    <MotionConfig reducedMotion="user">
    <div className={`relative z-10 flex w-full max-w-[560px] flex-col items-center ${className ?? ''}`}>
      <svg
        viewBox="0 0 480 380"
        className="h-auto w-full drop-shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
        role="img"
        aria-label="Buddy, the A&R office assistant, standing in a music-industry office with headphones and a clipboard"
      >
        <defs>
          <linearGradient id="bd-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#161d27" /><stop offset="1" stopColor="#0e141d" /></linearGradient>
          <linearGradient id="bd-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#0c1118" /><stop offset="1" stopColor="#070a0f" /></linearGradient>
          <linearGradient id="bd-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#103246" /><stop offset="1" stopColor="#071824" /></linearGradient>
          <linearGradient id="bd-screen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#08221d" /><stop offset="1" stopColor="#06140f" /></linearGradient>
          <linearGradient id="bd-skin" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F3C39B" /><stop offset="1" stopColor="#E2A271" /></linearGradient>
          <linearGradient id="bd-blazer" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#33455F" /><stop offset="1" stopColor="#212E42" /></linearGradient>
          <linearGradient id="bd-cup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3C4554" /><stop offset="1" stopColor="#222833" /></linearGradient>
          <linearGradient id="bd-hair" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3A3742" /><stop offset="1" stopColor="#26242C" /></linearGradient>
          <radialGradient id="bd-aura" cx="50%" cy="45%" r="55%"><stop offset="0" stopColor="#34D399" stopOpacity="0.28" /><stop offset="1" stopColor="#34D399" stopOpacity="0" /></radialGradient>
          <radialGradient id="bd-lamp" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FBBF24" stopOpacity="0.55" /><stop offset="1" stopColor="#FBBF24" stopOpacity="0" /></radialGradient>
        </defs>

        {/* ── room ───────────────────────────────────────────────────── */}
        <rect x="0" y="0" width="480" height="288" fill="url(#bd-wall)" />
        <rect x="0" y="288" width="480" height="92" fill="url(#bd-floor)" />
        <rect x="0" y="286" width="480" height="3" fill="rgba(255,255,255,0.05)" />

        {/* window with night skyline */}
        <rect x="22" y="48" width="104" height="118" rx="6" fill="#1c2531" stroke="#2c3848" strokeWidth="3" />
        <rect x="28" y="54" width="92" height="106" rx="3" fill="url(#bd-sky)" />
        <circle cx="104" cy="74" r="9" fill="#cfe8ef" opacity="0.85" />
        <path d="M28,160 V120 H40 V104 H52 V120 H60 V96 H72 V120 H82 V110 H94 V120 H104 V100 H114 V120 H120 V160 Z" fill="#06121b" />
        <g fill="#6EE7B7" opacity="0.8"><rect x="44" y="126" width="3" height="4" /><rect x="64" y="104" width="3" height="4" /><rect x="86" y="116" width="3" height="4" /><rect x="107" y="108" width="3" height="4" /></g>
        <g fill="#FBBF24" opacity="0.7"><rect x="34" y="132" width="3" height="4" /><rect x="75" y="124" width="3" height="4" /><rect x="97" y="130" width="3" height="4" /></g>
        <line x1="74" y1="54" x2="74" y2="160" stroke="#2c3848" strokeWidth="2" />
        <line x1="28" y1="107" x2="120" y2="107" stroke="#2c3848" strokeWidth="2" />

        {/* framed gold + platinum records */}
        <g transform="translate(322,44)">
          <rect width="62" height="62" rx="4" fill="#14191f" stroke="#2a3340" strokeWidth="2" />
          <rect x="6" y="6" width="50" height="50" rx="2" fill="#0e1218" />
          <circle cx="31" cy="31" r="20" fill="#E3B23C" /><circle cx="31" cy="31" r="20" fill="none" stroke="#caa133" strokeWidth="1" />
          <circle cx="31" cy="31" r="6" fill="#7a5e1c" /><circle cx="31" cy="31" r="1.6" fill="#0e1218" />
        </g>
        <g transform="translate(396,44)">
          <rect width="62" height="62" rx="4" fill="#14191f" stroke="#2a3340" strokeWidth="2" />
          <rect x="6" y="6" width="50" height="50" rx="2" fill="#0e1218" />
          <circle cx="31" cy="31" r="20" fill="#D5DCE6" /><circle cx="31" cy="31" r="20" fill="none" stroke="#aeb6c2" strokeWidth="1" />
          <circle cx="31" cy="31" r="6" fill="#8b93a1" /><circle cx="31" cy="31" r="1.6" fill="#0e1218" />
        </g>

        {/* shelf with vinyl + trophy */}
        <rect x="318" y="150" width="146" height="8" rx="2" fill="#222a36" />
        <g>
          <rect x="326" y="118" width="7" height="32" rx="1.5" fill="#3b4250" />
          <rect x="335" y="118" width="7" height="32" rx="1.5" fill="#b4884a" />
          <rect x="344" y="118" width="7" height="32" rx="1.5" fill="#2f6f63" />
          <rect x="353" y="118" width="7" height="32" rx="1.5" fill="#7a3b46" />
          <rect x="362" y="118" width="7" height="32" rx="1.5" fill="#46546b" />
          <rect x="371" y="118" width="7" height="32" rx="1.5" fill="#caa133" />
        </g>
        <g transform="translate(432,120)"><circle cx="6" cy="6" r="9" fill="none" stroke="#E3B23C" strokeWidth="3" /><rect x="3" y="14" width="6" height="10" fill="#E3B23C" /><rect x="-2" y="24" width="16" height="5" rx="1" fill="#caa133" /></g>

        {/* potted plant */}
        <g transform="translate(34,236)">
          <path d="M20,30 C6,18 2,2 12,-6 C16,6 22,12 22,28 Z" fill="#2f7d5b" />
          <path d="M22,30 C36,16 40,0 30,-8 C26,6 22,12 22,28 Z" fill="#246b4d" />
          <path d="M22,30 C22,8 22,-4 22,-12 C26,-2 26,14 24,30 Z" fill="#36916a" />
          <path d="M8,30 H36 L32,58 H12 Z" fill="#b5894b" />
          <rect x="6" y="28" width="32" height="6" rx="2" fill="#c79a55" />
        </g>

        {/* rug */}
        <ellipse cx="212" cy="318" rx="120" ry="22" fill="#10B981" opacity="0.10" />
        <ellipse cx="212" cy="318" rx="120" ry="22" fill="none" stroke="#10B981" strokeOpacity="0.18" strokeWidth="2" />

        {/* desk + props */}
        <rect x="300" y="266" width="172" height="12" rx="3" fill="#6e4c2e" />
        <rect x="300" y="266" width="172" height="4" fill="#855f3b" />
        <rect x="312" y="278" width="9" height="34" fill="#4a341f" />
        <rect x="452" y="278" width="9" height="34" fill="#4a341f" />
        {/* monitor */}
        <rect x="332" y="212" width="96" height="56" rx="4" fill="#171d26" />
        <rect x="337" y="217" width="86" height="46" rx="2" fill="url(#bd-screen)" />
        {EQ_BARS.map((b) => (
          <motion.rect
            key={b.x}
            x={b.x}
            y={226}
            width={6}
            height={29}
            rx={1}
            fill={b.color}
            style={pivotBottom}
            animate={{ scaleY: b.keys }}
            transition={{ duration: b.dur, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
        <rect x="375" y="268" width="10" height="10" fill="#171d26" /><rect x="364" y="278" width="32" height="5" rx="2" fill="#222a36" />
        {/* studio speaker */}
        <rect x="436" y="232" width="28" height="34" rx="3" fill="#20252e" /><circle cx="450" cy="252" r="8" fill="#2b313c" /><circle cx="450" cy="252" r="3" fill="#10141a" /><circle cx="450" cy="240" r="2.5" fill="#2b313c" />
        {/* coffee mug */}
        <g transform="translate(305,252)"><rect x="0" y="0" width="16" height="14" rx="3" fill="#DDE3EA" /><rect x="0" y="4" width="16" height="3" fill="#10B981" /><path d="M16,3 q6,0 6,5 t-6,5" fill="none" stroke="#DDE3EA" strokeWidth="2" /></g>
        {/* desk lamp + glow */}
        <motion.circle cx="320" cy="214" r="34" fill="url(#bd-lamp)" animate={{ opacity: [0.7, 1, 0.7] }} transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }} />
        <g stroke="#2a3340" strokeWidth="4" fill="none" strokeLinecap="round"><path d="M300,266 L308,224 L322,210" /></g>
        <circle cx="300" cy="266" r="6" fill="#222a36" />
        <path d="M316,205 l14,0 -4,12 -14,0 Z" fill="#2a3340" /><circle cx="321" cy="214" r="2.5" fill="#FBBF24" />

        {/* ── character (idle float) ─────────────────────────────────── */}
        <motion.g animate={{ y: [0, -7, 0] }} transition={{ duration: 4.2, repeat: Infinity, ease: 'easeInOut' }}>
          <g transform="translate(104,34) scale(0.83)">
            <ellipse cx="130" cy="322" rx="70" ry="11" fill="#000000" opacity="0.4" />
            <circle cx="130" cy="98" r="74" fill="url(#bd-aura)" />
            <rect x="104" y="258" width="20" height="48" rx="9" fill="#2A3140" />
            <rect x="136" y="258" width="20" height="48" rx="9" fill="#2A3140" />
            <ellipse cx="112" cy="306" rx="17" ry="8" fill="#13161D" />
            <ellipse cx="148" cy="306" rx="17" ry="8" fill="#13161D" />
            <path d="M82,170 C82,156 102,148 130,148 C158,148 178,156 178,170 L184,250 C184,264 166,270 130,270 C94,270 76,264 76,250 Z" fill="url(#bd-blazer)" />
            <path d="M115,150 L130,180 L145,150 Z" fill="#EAEFF6" />
            <path d="M115,150 L130,180 L120,150 Z" fill="#33455F" />
            <path d="M145,150 L130,180 L140,150 Z" fill="#33455F" />
            <path d="M116,156 L126,196" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
            <path d="M144,156 L134,196" stroke="#10B981" strokeWidth="5" strokeLinecap="round" />
            <rect x="116" y="194" width="28" height="24" rx="4" fill="#F5F7FB" />
            <rect x="116" y="194" width="28" height="8" rx="4" fill="#10B981" />
            <rect x="126" y="190" width="8" height="6" rx="2" fill="#8A8F99" />
            <text x="130" y="214" textAnchor="middle" fontSize="9" fontWeight="700" fill="#1F2937" fontFamily="ui-sans-serif, system-ui, sans-serif">A&amp;R</text>
            <rect x="74" y="178" width="22" height="64" rx="11" fill="url(#bd-blazer)" />
            <rect x="164" y="178" width="22" height="64" rx="11" fill="url(#bd-blazer)" />
            <rect x="96" y="206" width="68" height="58" rx="6" fill="#B17B3E" />
            <rect x="101" y="202" width="58" height="52" rx="3" fill="#F6F8FC" />
            <rect x="120" y="198" width="20" height="8" rx="2" fill="#8A8F99" />
            <rect x="107" y="212" width="34" height="3" rx="1.5" fill="#C9D2DE" />
            <rect x="107" y="219" width="26" height="3" rx="1.5" fill="#C9D2DE" />
            <polyline points="107,244 119,238 131,241 143,229 153,232" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="153" cy="232" r="2.4" fill="#34D399" />
            <circle cx="98" cy="240" r="9" fill="url(#bd-skin)" />
            <circle cx="162" cy="240" r="9" fill="url(#bd-skin)" />
            <circle cx="130" cy="98" r="60" fill="url(#bd-skin)" />
            <circle cx="72" cy="106" r="12" fill="#E2A271" />
            <circle cx="188" cy="106" r="12" fill="#E2A271" />
            <path d="M71,96 C68,52 96,30 130,30 C164,30 192,52 189,96 C176,74 158,64 130,64 C100,64 84,78 71,96 Z" fill="url(#bd-hair)" />
            <path d="M62,104 C62,40 198,40 198,104" fill="none" stroke="#39414F" strokeWidth="12" strokeLinecap="round" />
            <motion.g
              style={pivotCenter}
              animate={{ scaleY: [1, 1, 0.12, 1, 1] }}
              transition={{ duration: 4.6, times: [0, 0.9, 0.94, 0.98, 1], repeat: Infinity, ease: 'easeInOut' }}
            >
              <ellipse cx="111" cy="100" rx="10.5" ry="13" fill="#FFFFFF" />
              <ellipse cx="149" cy="100" rx="10.5" ry="13" fill="#FFFFFF" />
              <circle cx="113" cy="102" r="6" fill="#222B38" />
              <circle cx="147" cy="102" r="6" fill="#222B38" />
              <circle cx="111" cy="99" r="2.1" fill="#FFFFFF" />
              <circle cx="145" cy="99" r="2.1" fill="#FFFFFF" />
            </motion.g>
            <path d="M101,84 Q111,79 121,83" stroke="#2B2630" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d="M139,83 Q149,79 159,84" stroke="#2B2630" strokeWidth="3" strokeLinecap="round" fill="none" />
            <ellipse cx="100" cy="120" rx="9" ry="5.5" fill="#F472B6" opacity="0.35" />
            <ellipse cx="160" cy="120" rx="9" ry="5.5" fill="#F472B6" opacity="0.35" />
            <path d="M115,123 Q130,137 145,123" stroke="#7A4B2E" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            <rect x="46" y="86" width="32" height="48" rx="15" fill="url(#bd-cup)" />
            <rect x="182" y="86" width="32" height="48" rx="15" fill="url(#bd-cup)" />
            <circle cx="62" cy="110" r="8" fill="none" stroke="#34D399" strokeWidth="2" opacity="0.65" />
            <circle cx="198" cy="110" r="8" fill="none" stroke="#34D399" strokeWidth="2" opacity="0.65" />
            <motion.circle cx="62" cy="110" r="3.2" fill="#6EE7B7" style={pivotCenter} animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }} />
            <motion.circle cx="198" cy="110" r="3.2" fill="#6EE7B7" style={pivotCenter} animate={{ opacity: [0.4, 1, 0.4], scale: [0.85, 1.15, 0.85] }} transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }} />
          </g>
        </motion.g>

        {/* drifting music notes */}
        <FloatingNote x={350} y={186} delay={0} glyph="♪" />
        <FloatingNote x={158} y={150} delay={1.4} glyph="♫" />
        <FloatingNote x={300} y={150} delay={2.6} glyph="♩" />
      </svg>

      <div className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300">
        <motion.span
          className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        {caption}
      </div>
    </div>
    </MotionConfig>
  );
}

/** A single music note that drifts upward and fades, looping. */
function FloatingNote({ x, y, delay, glyph }: { x: number; y: number; delay: number; glyph: string }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <motion.text
        textAnchor="middle"
        fontSize="18"
        fill="#6EE7B7"
        animate={{ y: [0, -28], opacity: [0, 0.9, 0] }}
        transition={{ duration: 3.6, delay, repeat: Infinity, ease: 'easeOut' }}
      >
        {glyph}
      </motion.text>
    </g>
  );
}
