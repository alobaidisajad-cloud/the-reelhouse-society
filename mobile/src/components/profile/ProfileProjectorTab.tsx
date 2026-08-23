/**
 * ProfileProjectorTab — Wrapper component for the Projector analytics tab.
 * Combines ProjectorRoom + CinematicInsights into a single tab view.
 *
 * ⚠️ NOTHING IMPORTS THIS. A search of the whole mobile tree finds it only in
 * this file and in two audit documents — the member file renders ProjectorRoom
 * and CinematicInsights directly. It has been carried along and kept
 * compiling, which is why nobody noticed.
 *
 * Updated rather than deleted: removing a file is a decision for whoever owns
 * the plan, not a side effect of a data change. Flagged here so it is a
 * decision rather than an oversight.
 */
import { ScrollView, StyleSheet } from 'react-native';
import { ProjectorRoom, type ProjectorRecord } from './ProjectorRoom';
import { CinematicInsights } from './CinematicInsights';
import { colors } from '@/src/theme/theme';
import type { TasteProfile } from '@/src/constants/taste';

interface ProjectorTabStats {
    count: number;
    level: string;
    color: string;
    progress: number;
}

interface ProjectorTabUser {
    username?: string;
}

interface Props {
    stats: ProjectorTabStats;
    user: ProjectorTabUser;
    /** The server summary — streaks, average mark, monthly activity. */
    record?: ProjectorRecord | null;
    /** Genres, actors and directors over the WHOLE archive. */
    taste?: TasteProfile | null;
}

export function ProfileProjectorTab({ stats, user, record, taste }: Props) {
    return (
        <ScrollView style={s.container} contentContainerStyle={s.contentContainer} showsVerticalScrollIndicator={false}>
            <ProjectorRoom stats={stats} user={user} record={record} />
            {/* `logs` is gone: this panel no longer fetches sixty films from
                the phone, it reads one payload computed over everything. */}
            <CinematicInsights taste={taste} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.ink },
    contentContainer: { padding: 16, gap: 24, paddingBottom: 48 },
});
