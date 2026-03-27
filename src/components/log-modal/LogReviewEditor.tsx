interface LogReviewEditorProps {
    review: string
    setReview: (review: string) => void
    isSpoiler: boolean
    setIsSpoiler: (isSpoiler: boolean) => void
}

export default function LogReviewEditor({ review, setReview, isSpoiler, setIsSpoiler }: LogReviewEditorProps) {
    return (
        <div>
            <label style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--sepia)', display: 'block', marginBottom: '0.5rem' }}>
                REVIEW (OPTIONAL)
            </label>
            <textarea
                ref={(el) => {
                    // Auto-size on mount and when review changes externally (e.g. draft restore)
                    if (el) {
                        el.style.height = 'auto'
                        el.style.height = Math.max(120, el.scrollHeight) + 'px'
                    }
                }}
                className="input"
                style={{
                    minHeight: 120,
                    resize: 'none',
                    overflow: 'hidden',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.9rem',
                    lineHeight: 1.7,
                    letterSpacing: '0.01em',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                }}
                placeholder="Write your thoughts as if typing on a manuscript..."
                value={review}
                onChange={(e) => {
                    setReview(e.target.value)
                    // Auto-expand on every keystroke
                    const el = e.target
                    el.style.height = 'auto'
                    el.style.height = Math.max(120, el.scrollHeight) + 'px'
                }}
                onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--sepia)'
                    e.currentTarget.style.boxShadow = '0 0 0 1px rgba(139,105,20,0.2), inset 0 2px 8px rgba(0,0,0,0.3)'
                }}
                onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--ash)'
                    e.currentTarget.style.boxShadow = 'none'
                }}
                maxLength={2000}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', color: 'var(--fog)', letterSpacing: '0.1em', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={isSpoiler}
                        onChange={(e) => setIsSpoiler(e.target.checked)}
                        style={{ accentColor: 'var(--blood-reel)' }}
                    />
                    CONTAINS SPOILERS
                </label>
                <span style={{
                    fontFamily: 'var(--font-ui)', fontSize: '0.55rem', letterSpacing: '0.1em',
                    color: review.length > 1800 ? 'var(--flicker)' : 'var(--fog)',
                    transition: 'color 0.3s',
                }}>
                    {review.length}/2000
                </span>
            </div>
        </div>
    )
}
