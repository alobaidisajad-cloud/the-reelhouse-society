import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts } from '@/src/theme/theme';

export function RadarChart({ autopsy, size = 120 }: { autopsy: any; size?: number }) {
    if (!autopsy) return null;
    return (
        <View style={{ width: size, height: size, backgroundColor: colors.ash, borderRadius: size/2, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: fonts.ui, fontSize: 8, color: colors.sepia }}>RADAR INACTIVE</Text>
        </View>
    );
}
