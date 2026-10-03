import { Link } from 'react-router-dom';
import { Share2, Lock } from 'lucide-react';

import { ReelRating, SectionHeader } from '../../../components/UI';
import Poster from '../../../components/film/Poster';

import { VaultLedgerTab } from '../../../components/profile/VaultLedgerTab';
import PhysicalArchiveTab from '../../../components/profile/PhysicalArchiveTab';
import { ProjectorRoom } from '../../../components/profile/ProjectorRoom';
import { ProfileProjectorTab } from '../../../components/profile/ProfileProjectorTab';
import { TasteDNA } from '../../../components/profile/TasteDNA';
import CinematicInsights from '../../../components/profile/CinematicInsights';
import Achievements from '../../../components/profile/Achievements';
import { NoirPassport } from '../../../components/profile/NoirPassport';
import { AUTEURCalendar } from '../../../components/profile/AUTEURCalendar';
import { ListsSection } from '../../../components/profile/LedgerHelpers';
import { VaultWatchlistTab, VaultArchiveTab } from '../../../components/profile/VaultArchiveTab';
import TasteMatch from '../../../components/profile/TasteMatch';
import FilmRecommendations from '../../../components/profile/FilmRecommendations';
import { useViewport } from '../../../hooks/useViewport';
import { stampsOf, type ProfileAnalytics } from '../../../constants/honours';
import type { Standing } from '../../../constants/standing';
import { DNA_FLOOR } from '../../../components/profile/dna';

interface ProfileContentProps {
    activeTab: string;
    profileUser: any;
    profileLogs: any[];
    profileWatchlist: any[];
    profileLists: any[];
    physicalArchive: any[];
    isOwnProfile: boolean;
    /** The member's whole record (get_public_profile_analytics); undefined until read. */
    analytics: ProfileAnalytics | undefined;
    analyticsFailed: boolean;
    /** The standing, from the record; null until it is read. */
    stats: Standing | null;
    /** The six rated highest over the whole record (4 and up), highest first. */
    highestRated: { id: string; filmId: number; title: string; poster: string | null; rating: number }[];
    logsHasMore: boolean;
    listsHasMore: boolean;
    archiveSieve: string;
    archiveVisibleCount: number;
    archiveFilteredLogs: any[];
    setViewLog: (log: any) => void;
    fetchLogs: (loadMore?: boolean) => void;
    fetchLists: (loadMore?: boolean) => void;
    setArchiveSieve: (sieve: string) => void;
    setArchiveVisibleCount: (updater: number | ((prev: number) => number)) => void;
    setShowDNA: (show: boolean) => void;
}

export function ProfileContent({
    activeTab, profileUser, profileLogs, profileWatchlist, profileLists, physicalArchive,
    isOwnProfile, analytics, analyticsFailed, stats, highestRated, logsHasMore, listsHasMore,
    archiveSieve, archiveVisibleCount, archiveFilteredLogs,
    setViewLog, fetchLogs, fetchLists, setArchiveSieve, setArchiveVisibleCount, setShowDNA
}: ProfileContentProps) {
    const { isTouch: IS_TOUCH } = useViewport();

    return (
        <main style={{ padding: '2.5rem 0 5rem' }}>
            <div className="container layout-sidebar reversed">
                <div>
                    {activeTab === 'diary' && (
                        <VaultLedgerTab 
                            profileLogs={profileLogs} 
                            isOwnProfile={isOwnProfile} 
                            setViewLog={setViewLog} 
                            userRole={profileUser?.role}
                            hasMoreLogs={isOwnProfile ? logsHasMore : false}
                            onLoadMoreLogs={() => isOwnProfile && fetchLogs(true)}
                        />
                    )}

                    {activeTab === 'physical' && (
                        <PhysicalArchiveTab archive={physicalArchive} isOwnProfile={isOwnProfile} userId={profileUser?.id} userRole={profileUser?.role} />
                    )}

                    {activeTab === 'projector' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', paddingBottom: '3rem', animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}>
                            <div>
                                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                                    <div style={{ fontFamily: 'var(--font-ui)', fontSize: '0.65rem', letterSpacing: '0.2em', color: 'var(--sepia)', marginBottom: '0.5rem' }}>GLOBAL ANALYTICS</div>
                                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: IS_TOUCH ? '2rem' : '2.5rem', color: 'var(--parchment)', lineHeight: 1.1 }}>The Projector Room</h2>
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.9rem', color: 'var(--fog)', fontStyle: 'italic', marginTop: '0.5rem' }}>Lifetime cinematic data & achievements.</p>
                                </div>

                                <ProjectorRoom stats={stats} user={profileUser} />
                                
                                <div style={{ marginTop: '2rem' }}>
                                    <ProfileProjectorTab profileLogs={profileLogs} profileWatchlist={profileWatchlist} profileLists={profileLists} />
                                </div>
                            </div>

                            <div>
                                <TasteDNA analytics={analytics} failed={analyticsFailed} />
                                {(stampsOf(analytics)?.total_logs ?? 0) >= DNA_FLOOR && isOwnProfile && (
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => setShowDNA(true)}
                                        style={{ width: '100%', justifyContent: 'center', fontSize: '0.6rem', letterSpacing: '0.15em', gap: '0.4rem', marginTop: '1rem' }}
                                    >
                                        <Share2 size={12} /> SHARE CINEMA DNA
                                    </button>
                                )}
                            </div>

                            <div>
                                <SectionHeader label="REAL ANALYTICS" title="Cinematic Insights" />
                                <CinematicInsights logs={profileLogs} userId={profileUser?.id} />
                            </div>

                            <div>
                                <SectionHeader label="UNLOCKABLE BADGES" title="Society Honors" />
                                <Achievements analytics={analytics} failed={analyticsFailed} />
                            </div>

                            {highestRated.length > 0 && (
                                <div>
                                    <SectionHeader label="HIGHEST RATED" title="Your Favourites" />
                                    <div className="card" style={{ padding: '1.25rem' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            {highestRated.map((log) => (
                                                <Link key={log.id} to={`/film/${log.filmId}`} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none' }}>
                                                    {log.poster && (
                                                        <div style={{ width: 28, height: 42, flexShrink: 0, borderRadius: '2px', overflow: 'hidden', filter: 'sepia(0.3)' }}>
                                                            <Poster path={log.poster} title={log.title} sizeHint="sm" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div style={{ fontFamily: 'var(--font-sub)', fontSize: '0.75rem', color: 'var(--parchment)', lineHeight: 1.2, marginBottom: '0.2rem' }}>{log.title}</div>
                                                        <div style={{ display: 'block', width: '100%', flexShrink: 0 }}>
                                                            <ReelRating value={log.rating} size="sm" />
                                                        </div>
                                                    </div>
                                                </Link>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <SectionHeader label="CINEMATIC ACHIEVEMENTS" title="The Passport" />
                                <NoirPassport analytics={analytics} failed={analyticsFailed} />
                            </div>

                            <div>
                                {/* Every member's — the name no longer says a rank. */}
                                <SectionHeader label="VIEWING HISTORY" title="The Viewing Calendar" />
                                <AUTEURCalendar logs={profileLogs} />
                            </div>
                        </div>
                    )}

                    {activeTab === 'lists' && (
                        <div>
                            <SectionHeader label="YOUR COLLECTIONS" title="The Stacks" />
                            <ListsSection 
                                lists={profileLists} 
                                user={profileUser} 
                                hasMoreLists={isOwnProfile ? listsHasMore : false}
                                onLoadMoreLists={() => isOwnProfile && fetchLists(true)}
                            />
                        </div>
                    )}

                    {activeTab === 'watchlist' && (
                        <VaultWatchlistTab profileWatchlist={profileWatchlist} isOwnProfile={isOwnProfile} userRole={profileUser?.role} />
                    )}

                    {activeTab === 'archive' && (
                        <VaultArchiveTab 
                            profileLogs={profileLogs} 
                            isOwnProfile={isOwnProfile} 
                            setViewLog={setViewLog}
                            archiveSieve={archiveSieve} 
                            setArchiveSieve={setArchiveSieve} 
                            archiveVisibleCount={archiveVisibleCount} 
                            setArchiveVisibleCount={setArchiveVisibleCount} 
                            archiveFilteredLogs={archiveFilteredLogs}
                            userRole={profileUser?.role}
                            hasMoreLogs={isOwnProfile ? logsHasMore : false}
                            onLoadMoreLogs={() => isOwnProfile && fetchLogs(true)}
                        />
                    )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {/* THE VAULT box is gone from here. It printed the member's
                        WATCHLIST count as "N TITLES WITHIN — Private. Mysterious.
                        Yours alone.", and 0 on everyone else's profile. The Vault
                        is the private notes, which live on each log. */}
                    {!isOwnProfile && profileUser?.id && (
                        <TasteMatch userId={profileUser.id} theirUsername={profileUser.username || ''} />
                    )}

                    {isOwnProfile && <FilmRecommendations />}
                </div>
            </div>
        </main>
    );
}
