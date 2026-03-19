/**
 * CountryReleases — International release dates with certification badges.
 */
import { useState } from 'react'
import { Globe } from 'lucide-react'

export default function CountryReleases({ releaseDates }: any) {
    const [expanded, setExpanded] = useState(false)
    if (!releaseDates?.results?.length) return null

    const releases = releaseDates.results
        .filter((r: any) => r.release_dates?.some((d: any) => d.type <= 3))
        .sort((a: any, b: any) => {
            if (a.iso_3166_1 === 'US') return -1
            if (b.iso_3166_1 === 'US') return 1
            return a.iso_3166_1.localeCompare(b.iso_3166_1)
        })

    const visible = expanded ? releases : releases.slice(0, 6)
    const types: any = { 1: 'PREMIERE', 2: 'LIMITED', 3: 'THEATRICAL', 4: 'DIGITAL', 5: 'PHYSICAL', 6: 'TV' }

    return (
        <div className="card">
            <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Globe size={12} /> INTERNATIONAL RELEASES
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {visible.map(({ iso_3166_1, release_dates }: any) => {
                    const mainRelease = release_dates.find((d: any) => d.type === 3) || release_dates[0]
                    if (!mainRelease?.release_date) return null
                    const date = new Date(mainRelease.release_date)
                    const cert = mainRelease.certification
                    return (
                        <div key={iso_3166_1} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.1em', color: 'var(--sepia)', minWidth: 28, fontWeight: 'bold' }}>{iso_3166_1}</span>
                                {cert && <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.08em', color: 'var(--ink)', background: 'var(--fog)', padding: '0.1rem 0.3rem', borderRadius: '2px' }}>{cert}</span>}
                                <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.45rem', letterSpacing: '0.06em', color: 'var(--ash)' }}>{types[mainRelease.type] || ''}</span>
                            </div>
                            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--bone)' }}>
                                {date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                        </div>
                    )
                })}
            </div>
            {releases.length > 6 && (
                <button onClick={() => setExpanded(!expanded)} style={{ marginTop: '0.75rem', width: '100%', background: 'transparent', border: '1px dashed var(--ash)', color: 'var(--fog)', fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.1em', padding: '0.5rem', borderRadius: '2px', cursor: 'pointer' }}>
                    {expanded ? `↑ SHOW LESS` : `↓ ${releases.length - 6} MORE COUNTRIES`}
                </button>
            )}
        </div>
    )
}
