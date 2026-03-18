// Pure CSS/SVG mascot — Buster the Ghost
// "Slightly unsettling. Too many teeth when he smiles."

export default function Buster({ size = 120, message = null, mood = 'neutral', className = '' }) {
    const colors = {
        body: '#E8DFC8',
        eyes: '#0A0703',
        mouth: '#0A0703',
        tear: '#8B6914',
    }

    const moodFace = {
        neutral: (
            <>
                {/* Eyes */}
                <ellipse cx="38" cy="52" rx="6" ry="7" fill={colors.eyes} />
                <ellipse cx="62" cy="52" rx="6" ry="7" fill={colors.eyes} />
                {/* Pupils with gleam */}
                <circle cx="40" cy="50" r="2" fill="white" />
                <circle cx="64" cy="50" r="2" fill="white" />
                {/* Mouth — too many teeth */}
                <path d="M 34 68 Q 50 80 66 68" stroke={colors.mouth} strokeWidth="2.5" fill="none" />
                <rect x="40" y="68" width="4" height="5" fill={colors.mouth} rx="0.5" />
                <rect x="46" y="69" width="4" height="6" fill={colors.mouth} rx="0.5" />
                <rect x="52" y="68" width="4" height="5" fill={colors.mouth} rx="0.5" />
                <rect x="58" y="67" width="3" height="4" fill={colors.mouth} rx="0.5" />
            </>
        ),
        crying: (
            <>
                <ellipse cx="38" cy="52" rx="6" ry="7" fill={colors.eyes} />
                <ellipse cx="62" cy="52" rx="6" ry="7" fill={colors.eyes} />
                <circle cx="40" cy="50" r="2" fill="white" />
                <circle cx="64" cy="50" r="2" fill="white" />
                {/* Cartoon tears */}
                <ellipse cx="30" cy="62" rx="4" ry="8" fill={colors.tear} opacity="0.7" />
                <ellipse cx="70" cy="62" rx="4" ry="8" fill={colors.tear} opacity="0.7" />
                {/* Sad mouth */}
                <path d="M 34 74 Q 50 64 66 74" stroke={colors.mouth} strokeWidth="2.5" fill="none" />
                <rect x="40" y="68" width="3" height="4" fill={colors.mouth} rx="0.5" />
                <rect x="47" y="67" width="3" height="5" fill={colors.mouth} rx="0.5" />
                <rect x="54" y="68" width="3" height="4" fill={colors.mouth} rx="0.5" />
            </>
        ),
        smiling: (
            <>
                <ellipse cx="38" cy="52" rx="6" ry="7" fill={colors.eyes} />
                <ellipse cx="62" cy="52" rx="6" ry="7" fill={colors.eyes} />
                <circle cx="40" cy="50" r="2" fill="white" />
                <circle cx="64" cy="50" r="2" fill="white" />
                {/* Big grin — WAY too many teeth */}
                <path d="M 28 66 Q 50 84 72 66" stroke={colors.mouth} strokeWidth="2" fill="none" />
                <rect x="32" y="67" width="3" height="5" fill={colors.mouth} rx="0.3" />
                <rect x="37" y="67" width="3" height="7" fill={colors.mouth} rx="0.3" />
                <rect x="42" y="68" width="3" height="7" fill={colors.mouth} rx="0.3" />
                <rect x="47" y="68" width="3" height="8" fill={colors.mouth} rx="0.3" />
                <rect x="52" y="68" width="3" height="7" fill={colors.mouth} rx="0.3" />
                <rect x="57" y="67" width="3" height="7" fill={colors.mouth} rx="0.3" />
                <rect x="62" y="67" width="3" height="5" fill={colors.mouth} rx="0.3" />
            </>
        ),
        peeking: (
            <>
                <ellipse cx="38" cy="52" rx="6" ry="5" fill={colors.eyes} />
                <ellipse cx="62" cy="52" rx="6" ry="5" fill={colors.eyes} />
                <circle cx="40" cy="51" r="2" fill="white" />
                <circle cx="64" cy="51" r="2" fill="white" />
                {/* Sly grin */}
                <path d="M 38 68 Q 50 76 62 66" stroke={colors.mouth} strokeWidth="2.5" fill="none" />
                <rect x="44" y="68" width="3" height="5" fill={colors.mouth} rx="0.5" />
                <rect x="49" y="69" width="3" height="4" fill={colors.mouth} rx="0.5" />
            </>
        ),
    }

    return (
        <div className={`buster-container ${className}`} style={{ width: size }}>
            <svg
                viewBox="0 0 100 140"
                width={size}
                height={size * 1.4}
                xmlns="http://www.w3.org/2000/svg"
            >
                {/* Ghostly body — wobbly bottom */}
                <path
                    d="M 10 55 Q 10 10 50 10 Q 90 10 90 55 L 90 100 Q 82 90 74 100 Q 66 110 58 100 Q 50 90 42 100 Q 34 110 26 100 Q 18 90 10 100 Z"
                    fill={colors.body}
                    opacity="0.92"
                />
                {/* Ghostly glow */}
                <path
                    d="M 10 55 Q 10 10 50 10 Q 90 10 90 55 L 90 100 Q 82 90 74 100 Q 66 110 58 100 Q 50 90 42 100 Q 34 110 26 100 Q 18 90 10 100 Z"
                    fill="none"
                    stroke="rgba(242,232,160,0.15)"
                    strokeWidth="3"
                />
                {/* Face */}
                {moodFace[mood] || moodFace.neutral}

                {/* Tiny crown/bow for personality */}
                {mood === 'smiling' && (
                    <path d="M 42 16 L 44 8 L 50 14 L 56 8 L 58 16 Z" fill="#8B6914" stroke="#F2E8A0" strokeWidth="0.5" />
                )}

                {/* Film reel element for crying mood */}
                {mood === 'crying' && (
                    <g transform="translate(32, 110) rotate(-15)">
                        <circle cx="0" cy="0" r="12" fill="none" stroke={colors.body} strokeWidth="2" />
                        <circle cx="0" cy="0" r="4" fill={colors.body} />
                        <line x1="-12" y1="0" x2="12" y2="0" stroke={colors.body} strokeWidth="1.5" />
                        <line x1="0" y1="-12" x2="0" y2="12" stroke={colors.body} strokeWidth="1.5" />
                    </g>
                )}
            </svg>

            {message && (
                <div style={{
                    fontFamily: "'Special Elite', cursive",
                    fontSize: '0.8rem',
                    color: 'var(--bone)',
                    textAlign: 'center',
                    maxWidth: 200,
                    lineHeight: 1.5,
                    padding: '0.5rem 1rem',
                    background: 'rgba(28,23,16,0.8)',
                    border: '1px solid var(--ash)',
                    borderRadius: 'var(--radius-card)',
                    position: 'relative',
                }}>
                    {/* Speech bubble tail */}
                    <div style={{
                        position: 'absolute',
                        top: -8,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0,
                        height: 0,
                        borderLeft: '8px solid transparent',
                        borderRight: '8px solid transparent',
                        borderBottom: '8px solid var(--ash)',
                    }} />
                    {message}
                </div>
            )}
        </div>
    )
}
