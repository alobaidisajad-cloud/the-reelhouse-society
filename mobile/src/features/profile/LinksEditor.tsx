import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GripVertical, Plus, X } from 'lucide-react-native';
import { ControlledInput } from '@/src/components/ControlledInput';
import PressableScale from '@/src/components/PressableScale';
import { colors, fonts } from '@/src/theme/theme';

export interface LinksEditorProps {
  links: { id: string; title: string; url: string }[];
  handleAddLink: () => void;
  handleRemoveLink: (index: number) => void;
  errors: { links?: ({ title?: { message?: string }; url?: { message?: string } } | undefined)[] };
}

export function LinksEditor({ links, handleAddLink, handleRemoveLink, errors }: LinksEditorProps) {
  return (
    <View>
      <Text style={st.fieldBody}>Add links to your profile. They will be visible to anyone who visits your page.</Text>
      
      <View style={st.linksContainer}>
          {links.map((link, index) => (
              <View key={link.id} style={st.linkItem}>
                  <View style={st.linkItemHeader}>
                      <View style={st.linkDragHandleRow}>
                          <GripVertical size={12} color={colors.ash} style={st.linkDragHandleIcon} />
                          <Text style={st.linkItemTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>LINK {index + 1}</Text>
                      </View>
                  </View>

                  {/* Hung on the CARD, not on the header row.
                      A 14pt × with 4pt of padding is a 22pt control — under both
                      platforms' floors — and it could not simply grow, because a
                      child only receives touches its PARENT's bounds contain, and
                      the header row is only 22pt tall. Anchored to the card
                      instead, the whole 48pt box is live. It lands within a point
                      of where the glyph already sat, so nothing moves.
                      Placed before the fields so that where the box grazes the
                      TITLE input, the input wins — a later sibling always does. */}
                  <PressableScale onPress={() => handleRemoveLink(index)} style={st.linkRemoveBtn} hitSlop={null} haptic="light" accessibilityLabel="Remove link">
                      <X size={14} color={colors.ash} />
                  </PressableScale>

                  <View style={st.fieldWrap}>
                      <Text style={st.fieldLabel}>TITLE</Text>
                      <ControlledInput
                        name={`links.${index}.title` as const}
                        style={st.fieldInput} placeholder="e.g. My Portfolio, Blog, Channel..." placeholderTextColor={colors.ash} maxLength={40} keyboardAppearance="dark" accessibilityLabel="Link title" selectionColor={colors.sepia}
                      />
                  </View>
                  
                  <View style={st.fieldWrap}>
                      <Text style={st.fieldLabel}>URL</Text>
                      <ControlledInput
                        name={`links.${index}.url` as const}
                        style={st.fieldInput} placeholder="https://..." placeholderTextColor={colors.ash} keyboardType="url" autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" accessibilityLabel="Link URL" selectionColor={colors.sepia}
                      />
                      {!!errors.links?.[index]?.url && <Text style={st.errorText}>{errors.links[index]?.url?.message}</Text>}
                  </View>
              </View>
          ))}
      </View>

      <PressableScale style={st.addLinkBtn} onPress={handleAddLink} haptic="selection" accessibilityLabel="Add link">
          <Plus size={14} color={colors.sepia} />
          <Text style={st.addLinkText}>ADD LINK</Text>
      </PressableScale>

      {links.length > 0 && <Text style={st.linksCount}>{links.length}/10 LINKS</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  fieldBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, marginBottom: 12 },
  linksContainer: { gap: 16, marginBottom: 12 },
  linkItem: { padding: 16, backgroundColor: 'rgba(10,7,3,0.5)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)', borderRadius: 4 },
  // minHeight keeps this row exactly as tall as it was when the × lived inside
  // it, so pulling the × out onto the card moves nothing below it.
  linkItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, minHeight: 22 },
  linkItemTitle: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog },
  // 48 × 48 by its own geometry, which is the only thing either platform's
  // accessibility layer can see — a halo is invisible to both, so this needs
  // none and takes nothing from its neighbours.
  linkRemoveBtn: {
    position: 'absolute', top: 4, right: 4,
    width: 48, height: 48,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia, marginBottom: 6 },
  fieldInput: { width: '100%', paddingHorizontal: 14, paddingVertical: 11, backgroundColor: 'rgba(10,7,3,0.6)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.1)', borderRadius: 3, color: colors.parchment, fontFamily: fonts.body, fontSize: 14 },
  errorText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.crimson, marginTop: 4 },
  addLinkBtn: { width: '100%', padding: 14, backgroundColor: 'rgba(184,137,26,0.05)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderStyle: 'dashed', borderRadius: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  addLinkText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  linksCount: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.ash, textAlign: 'center', marginTop: 10 },
  linkDragHandleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkDragHandleIcon: { opacity: 0.4 },
});
