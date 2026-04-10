/**
 * ProfileProjectorTab — Wrapper component for the Projector analytics tab.
 * Combines ProjectorRoom + CinematicInsights into a single tab view.
 */
import { ScrollView, StyleSheet } from 'react-native';
import { ProjectorRoom } from './ProjectorRoom';
import { CinematicInsights } from './CinematicInsights';
import { colors } from '@/src/theme/theme';

interface Props {
    stats: any;
    user: any;
    logs: any[];
}

export function ProfileProjectorTab({ stats, user, logs }: Props) {
    return (
        <ScrollView style={s.container} contentContainerStyle={s.contentContainer} showsVerticalScrollIndicator={false}>
            <ProjectorRoom stats={stats} user={user} />
            <CinematicInsights logs={logs} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.ink },
    contentContainer: { padding: 16, gap: 24, paddingBottom: 48 },
});
