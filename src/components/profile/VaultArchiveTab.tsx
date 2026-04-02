import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { SectionHeader, FilmCard } from '../UI'
import Buster from '../Buster'
import { RotateCcw, X } from 'lucide-react'
import { WatchlistRoulette } from './WatchlistRoulette'

import { useViewport } from '../../hooks/useViewport'

import { FilmLog, WatchlistItem } from '../../types'

interface VaultArchiveTabProps {
    profileLogs: FilmLog[];
    isOwnProfile: boolean;
    setViewLog: (log: FilmLog) => void;
    archiveSieve: string;
    setArchiveSieve: (s: string) => void;
    archiveVisibleCount: number;
    setArchiveVisibleCount: (updater: number | ((prev: number) => number)) => void;
    archiveFilteredLogs: FilmLog[];
    userRole?: string;
}

export function VaultArchiveTab({ profileLogs, isOwnProfile, setViewLog, archiveSieve, setArchiveSieve, archiveVisibleCount, setArchiveVisibleCount, archiveFilteredLogs, userRole }: VaultArchiveTabProps) {
    const isArchivist = userRole === 'archivist'
    const isAuteur = userRole === 'auteur' || userRole === 'projectionist'
    const { isTouch: IS_TOUCH } = useViewport()
    return (
        <div>
            <SectionHeader label="ALL WATCHED FILMS" title="The Archive" />
            {profileLogs.length > 0 && (
                <div className="profile-sieve-strip" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem', borderBottom: '1px solid var(--ash)' }}>
                    {[{ id: 'all', label: 'All' }, { id: 'watched', label: 'Watched' }, { id: 'rewatched', label: 'Rewatched' }, { id: 'abandoned', label: 'Abandoned' }].map(s => (
                        <button key={s.id} onClick={() => setArchiveSieve(s.id)} className={`btn ${archiveSieve === s.id ? 'btn-primary' : 'btn-ghost'}`} style={{ fontSize: '0.65rem', padding: '0.4rem 0.75rem', whiteSpace: 'nowrap' }}>{s.label}</button>
                    ))}
                </div>
            )}
            {archiveFilteredLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)' }}>
                    <Buster size={80} mood="peeking" />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginTop: '1.5rem', marginBottom: '0.5rem' }}>The Archive is Empty</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto', lineHeight: 1.4 }}>
                        {profileLogs.length === 0 ? (isOwnProfile ? "No films watched yet. Mark a film as watched or log your first film." : "This member hasn't watched any films yet.") : "No films match this filter."}
                    </div>
                </div>
            ) : (() => {
                const shown = archiveFilteredLogs.slice(0, archiveVisibleCount)
                const grouped = shown.reduce((acc: Record<string, FilmLog[]>, log) => {
                    const d = new Date(log.watchedDate || log.createdAt || new Date().toISOString())
                    const title = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase()
                    if (!acc[title]) acc[title] = []
                    acc[title].push(log)
                    return acc
                }, {})
                return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem' }}>
                        {Object.keys(grouped).map(month => (
                            <div key={month}>
                                <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '1rem', borderBottom: '1px solid rgba(139,105,20,0.1)', paddingBottom: '0.5rem' }}>
                                    {month}
                                </div>
                                <div className="profile-log-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: IS_TOUCH ? '0.2rem' : '0.75rem' }}>
                                    {grouped[month].map((log) => (
                                        <div key={log.id} onClick={() => setViewLog(log)} className={isArchivist ? 'archivist-card-glow' : isAuteur ? 'auteur-card-glow' : ''} style={{ position: 'relative', cursor: 'pointer' }}>
                                            <FilmCard film={{ id: log.filmId, title: log.title, poster_path: log.altPoster || log.poster, release_date: log.year + '-01-01', userRating: log.rating, status: log.status } as any} />
                                            {log.status === 'rewatched' && (
                                                <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(10,7,3,0.85)', backdropFilter: 'blur(4px)', border: '1px solid rgba(139,105,20,0.3)', borderRadius: '2px', padding: '0.15rem 0.35rem', pointerEvents: 'none' }}>
                                                    <RotateCcw size={9} color="var(--sepia)" />
                                                </div>
                                            )}
                                            {log.status === 'abandoned' && (
                                                <div style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(10,7,3,0.85)', backdropFilter: 'blur(4px)', border: '1px solid rgba(139,30,30,0.3)', borderRadius: '2px', padding: '0.15rem 0.35rem', pointerEvents: 'none' }}>
                                                    <X size={9} color="var(--blood-reel)" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {archiveVisibleCount < archiveFilteredLogs.length && (
                            <div style={{ textAlign: 'center', padding: '2rem', fontFamily: 'var(--font-ui)', fontSize: '0.6rem', letterSpacing: '0.15em', color: 'var(--fog)', cursor: 'pointer' }} onClick={() => setArchiveVisibleCount((c: number) => c + 40)}>
                                LOAD MORE REELS...
                            </div>
                        )}
                    </div>
                )
            })()}
        </div>
    )
}

export function VaultWatchlistTab({ profileWatchlist, isOwnProfile, userRole }: { profileWatchlist: WatchlistItem[], isOwnProfile: boolean, userRole?: string }) {
    const isArchivist = userRole === 'archivist'
    const isAuteur = userRole === 'auteur' || userRole === 'projectionist'
    const { isTouch: IS_TOUCH } = useViewport()
    return (
        <div>
            <SectionHeader label="FILMS TO SEE" title="Watchlist" />
            {profileWatchlist.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--fog)', fontFamily: 'var(--font-body)', fontSize: '0.85rem' }}>{isOwnProfile ? "Your watchlist is empty. Start saving films." : "This member hasn't saved any films yet."}</div>
            ) : (
                <>
                    <WatchlistRoulette watchlist={profileWatchlist} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: IS_TOUCH ? '0.2rem' : '1rem' }}>
                        {profileWatchlist.map((film) => (
                            <Link key={film.id} to={`/film/${film.id}`}>
                                <motion.div className={isArchivist ? 'archivist-card-glow' : isAuteur ? 'auteur-card-glow' : ''} whileHover={{ y: -3, transition: { type: 'spring', damping: 12 } }}><FilmCard film={film as any} /></motion.div>
                            </Link>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

export function VaultPhysicalArchiveTab({ physicalArchive, isOwnProfile }: { physicalArchive: any[], isOwnProfile: boolean }) {
    const { isTouch: IS_TOUCH } = useViewport()
    return (
        <div>
            <SectionHeader label="YOUR COLLECTION" title="Physical Archive" />
            {physicalArchive.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', border: '1px solid var(--ash)', borderRadius: 'var(--radius-card)', background: 'linear-gradient(180deg, var(--soot) 0%, var(--ink) 100%)' }}>
                    <Buster size={80} mood="peeking" />
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--parchment)', marginTop: '1.5rem', marginBottom: '0.5rem' }}>The Shelves are Empty</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', maxWidth: 400, margin: '0 auto', lineHeight: 1.4 }}>
                        {isOwnProfile ? "No physical media tracked yet. Tell the society about your collection." : "This member hasn't logged any physical media yet."}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: IS_TOUCH ? '0.2rem' : '0.75rem' }}>
                    {physicalArchive.map((item) => (
                        <Link key={item.id} to={`/film/${item.filmId}`} style={{ position: 'relative', display: 'block' }}>
                            <FilmCard film={{ id: item.filmId, title: item.title, poster_path: item.poster_path, release_date: item.year ? item.year.toString() : '' } as any} />
                            {item.formats && item.formats.length > 0 && (
                                <div style={{ 
                                    position: 'absolute', top: 4, right: 4, 
                                    background: 'rgba(10,5,0,0.95)', backdropFilter: 'blur(4px)', 
                                    border: '1px solid rgba(139,105,20,0.5)', borderRadius: '2px', 
                                    padding: '0.2rem 0.4rem', pointerEvents: 'none',
                                    fontFamily: 'var(--font-ui)', fontSize: '0.5rem', letterSpacing: '0.15em',
                                    color: 'var(--sepia)', textTransform: 'uppercase',
                                    boxShadow: '0 2px 10px rgba(0,0,0,0.8)'
                                }}>
                                    {item.formats[0]}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

