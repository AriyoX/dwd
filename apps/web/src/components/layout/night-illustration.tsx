export function NightIllustration({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`night-illustration${compact ? ' illustration-compact' : ''}`}
      aria-hidden="true"
    >
      <div className="illustration-orbit orbit-one" />
      <div className="illustration-orbit orbit-two" />
      <div className="illustration-disc" />
      <svg viewBox="0 0 420 360" fill="none" className="glass-illustration">
        <ellipse cx="218" cy="318" rx="137" ry="15" fill="currentColor" opacity=".07" />
        <g transform="rotate(-14 165 210)">
          <path
            d="M104 89H224L212 180C208 211 190 228 164 228C138 228 120 211 116 180L104 89Z"
            fill="#FFF9E8"
            fillOpacity=".65"
            stroke="#344D3D"
            strokeWidth="3"
          />
          <path
            d="M115 143H214L210 180C207 207 189 222 164 222C140 222 123 207 120 180L115 143Z"
            fill="#D6A65D"
          />
          <path
            d="M164 229V300M133 301H195"
            stroke="#344D3D"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path d="M122 103L129 130" stroke="white" strokeWidth="5" strokeLinecap="round" />
        </g>
        <g transform="rotate(12 278 225)">
          <path
            d="M229 137H328L317 297C316 307 310 311 300 311H256C246 311 240 307 239 297L229 137Z"
            fill="#FDFBF2"
            fillOpacity=".78"
            stroke="#344D3D"
            strokeWidth="3"
          />
          <path
            d="M237 195H320L313 294C312 302 307 305 299 305H257C249 305 245 302 244 294L237 195Z"
            fill="#ADBC9C"
          />
          <rect
            x="249"
            y="179"
            width="27"
            height="27"
            rx="5"
            transform="rotate(-12 249 179)"
            fill="#F6F7E6"
            fillOpacity=".8"
          />
          <rect
            x="285"
            y="199"
            width="25"
            height="25"
            rx="5"
            transform="rotate(17 285 199)"
            fill="#F6F7E6"
            fillOpacity=".7"
          />
          <path d="M296 202L317 107" stroke="#344D3D" strokeWidth="5" strokeLinecap="round" />
          <path d="M241 153L244 182" stroke="white" strokeWidth="4" strokeLinecap="round" />
          <circle cx="236" cy="149" r="24" fill="#E8CF82" stroke="#344D3D" strokeWidth="2" />
          <path
            d="M219 150H253M236 132V166M224 138L248 161M224 161L248 138"
            stroke="#FDF6D6"
            strokeWidth="2"
          />
        </g>
        <path
          d="M91 217V237M81 227H101M319 61V79M310 70H328"
          stroke="#647658"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="83" cy="123" r="4" fill="#B18042" />
        <circle cx="346" cy="249" r="5" fill="#B18042" />
      </svg>
    </div>
  );
}
