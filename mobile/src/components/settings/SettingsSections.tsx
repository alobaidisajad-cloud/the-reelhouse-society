import React from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Switch, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Crown, Lock, Eye, Bell, Shield, LogOut, Trash2, Smartphone, ChevronDown, ChevronUp, Star, Sparkles, User, FileText } from 'lucide-react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

const AnimatedView = Animated.createAnimatedComponent(View);

// ═══ REUSABLE COMPONENTS ═══
export const SectionCard = ({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <View style={[st.sectionCard, danger && st.sectionCardDanger]}>
    <LinearGradient
      colors={danger ? ['transparent', 'rgba(162,36,36,0.2)', 'transparent'] : ['transparent', 'rgba(139,105,20,0.2)', 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={st.sectionTopLine}
    />
    <LinearGradient
      colors={['rgba(139,105,20,0.03)', 'transparent']}
      style={StyleSheet.absoluteFillObject}
    />
    {children}
  </View>
);

export const SectionHead = ({ icon: Icon, label, danger }: { icon: any; label: string; danger?: boolean }) => (
  <View style={st.sectionHeaderWrap}>
    <View style={st.sectionHeaderRow}>
      <Icon size={14} color={danger ? 'rgba(162,36,36,0.7)' : colors.sepia} style={st.sectionHeaderIcon} />
      <Text style={[st.sectionHeaderText, danger && st.sectionHeaderTextDanger]}>{label}</Text>
    </View>
  </View>
);

export const Toggle = ({ active, onToggle }: { active: boolean; onToggle: () => void }) => (
  <Switch
    value={active}
    onValueChange={() => { Haptics.selectionAsync(); onToggle(); }}
    trackColor={{ false: 'rgba(139,105,20,0.12)', true: colors.sepia }}
    thumbColor={active ? colors.parchment : colors.fog}
  />
);

export const RadioOption = ({ selected, label, onPress }: { selected: boolean; label: string; onPress: () => void }) => (
  <TouchableOpacity
    style={[st.radioOption, selected && st.radioOptionActive]}
    onPress={() => { Haptics.selectionAsync(); onPress(); }}
    activeOpacity={0.7}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  >
    <View style={[st.radioDot, selected && st.radioDotActive]} />
    <Text style={[st.radioLabel, selected && st.radioLabelActive]}>{label}</Text>
  </TouchableOpacity>
);

export const ActionBtn = ({ icon: Icon, label, onPress, danger }: { icon: any; label: string; onPress: () => void; danger?: boolean }) => (
  <TouchableOpacity
    style={[st.actionBtn, danger && st.actionBtnDanger]}
    onPress={onPress}
    activeOpacity={0.7}
    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
  >
    <Icon size={12} color={danger ? 'rgba(162,36,36,0.7)' : colors.fog} />
    <Text style={[st.actionBtnText, danger && st.actionBtnTextDanger]}>{label}</Text>
  </TouchableOpacity>
);

// ═══ SECTIONS ═══

export function PatronageSection({ userRole, router }: { userRole: string; router: any }) {
  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(100)}>
      <SectionCard>
        <SectionHead icon={Crown} label="PATRONAGE & BILLING" />
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel}>YOUR RANK</Text>
          <View style={st.rankRow}>
            <Text style={[
              st.rankDisplay,
              userRole === 'auteur' && st.rankAuteur,
              userRole === 'archivist' && st.rankArchivist,
              userRole !== 'auteur' && userRole !== 'archivist' && st.rankCinephile,
            ]}>
              {userRole === 'auteur' ? 'Auteur' : userRole === 'archivist' ? 'Archivist' : 'Cinephile'}
            </Text>
            {userRole === 'auteur' && <Star size={12} color='#7d1f1f' strokeWidth={1.5} fill='#7d1f1f' />}
            {userRole === 'archivist' && <Sparkles size={12} color={colors.sepia} strokeWidth={1.5} />}
            {(userRole === 'auteur' || userRole === 'archivist') && (
              <View style={st.activeBadge}><Text style={st.activeBadgeText}>ACTIVE</Text></View>
            )}
          </View>
        </View>
        <View style={st.dividerSpaced} />
        {(!userRole || userRole === 'cinephile' || userRole === 'free') ? (
          <View>
            <Text style={st.fieldBody}>Unlock The Editorial Desk, The Physical Archive, The Lounge, and more by upgrading your patronage.</Text>
            <TouchableOpacity style={st.primaryBtn} onPress={() => router.push('/membership')} activeOpacity={0.7}>
              <Text style={st.primaryBtnText}>UPGRADE YOUR RANK</Text>
            </TouchableOpacity>
          </View>
        ) : userRole === 'archivist' ? (
          <View>
            <Text style={st.fieldBody}>You're an Archivist. Upgrade to Auteur for radar breakdowns, curatorial poster control, and the gold Dispatch badge.</Text>
            <TouchableOpacity style={st.primaryBtn} onPress={() => router.push('/membership')} activeOpacity={0.7}>
              <Text style={st.primaryBtnText}>UPGRADE TO AUTEUR</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={st.fieldBody}>You hold the highest rank in The Society. All features are unlocked.</Text>
        )}
        <Text style={st.microNote}>PAYMENTS PROCESSED SECURELY VIA PAYTABS · MANAGE BILLING AT PATRONAGE</Text>
      </SectionCard>
    </AnimatedView>
  );
}

export function AccountSection(props: any) {
  const { user, showPasswordChange, setShowPasswordChange, newPassword, setNewPassword, confirmPassword, setConfirmPassword, changingPassword, handlePasswordChange } = props;
  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(150)}>
      <SectionCard>
        <SectionHead icon={Lock} label="ACCOUNT" />
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel}>USERNAME</Text>
          <View style={st.readonlyField}><Text style={st.readonlyText}>@{user.username}</Text></View>
        </View>
        <View style={st.fieldWrap}>
          <Text style={st.fieldLabel}>EMAIL</Text>
          <View style={st.readonlyField}><Text style={st.readonlyText}>{user.email}</Text></View>
        </View>
        <TouchableOpacity style={st.actionBtnSpaced} onPress={() => setShowPasswordChange(!showPasswordChange)} activeOpacity={0.7}>
          <Lock size={12} color={colors.fog} />
          <Text style={st.actionBtnTextFlex}>CHANGE PASSWORD</Text>
          {showPasswordChange ? <ChevronUp size={12} color={colors.fog} /> : <ChevronDown size={12} color={colors.fog} />}
        </TouchableOpacity>
        {showPasswordChange && (
          <View style={st.passwordPanel}>
            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>NEW PASSWORD</Text>
              <TextInput style={st.fieldInput} value={newPassword} onChangeText={setNewPassword} secureTextEntry placeholder="Min. 8 characters" placeholderTextColor={colors.ash} />
            </View>
            <View style={st.fieldWrap}>
              <Text style={st.fieldLabel}>CONFIRM PASSWORD</Text>
              <TextInput style={st.fieldInput} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholder="Repeat password" placeholderTextColor={colors.ash} />
            </View>
            <TouchableOpacity style={[st.saveFieldBtn, (!newPassword || !confirmPassword) && st.disabledBtn]} onPress={handlePasswordChange} disabled={changingPassword || !newPassword || !confirmPassword} activeOpacity={0.7}>
              <Text style={st.saveFieldBtnText}>{changingPassword ? 'UPDATING...' : 'UPDATE PASSWORD'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </SectionCard>
    </AnimatedView>
  );
}

export function PrivacySection(props: any) {
  const { socialVisibility, setSocialVisibility, privacyEndorsements, setPrivacyEndorsements, privacyAnnotations, setPrivacyAnnotations } = props;
  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(200)}>
      <SectionCard>
        <SectionHead icon={Eye} label="PRIVACY" />
        <View style={st.privacyGroup}>
          <Text style={st.privacyGroupLabel}>SOCIAL VISIBILITY</Text>
          {[
            { value: 'public', label: 'Public — Visible to everyone' },
            { value: 'followers', label: 'Followers Only — Only your followers can see' },
            { value: 'private', label: 'Private — Only you can see your activity' },
          ].map(opt => <RadioOption key={opt.value} selected={socialVisibility === opt.value} label={opt.label} onPress={() => setSocialVisibility(opt.value)} />)}
        </View>
        <View style={st.privacyGroup}>
          <Text style={st.privacyGroupLabel}>WHO CAN CERTIFY</Text>
          {[
            { value: 'everyone', label: 'Everyone' },
            { value: 'followers', label: 'Followers Only' },
            { value: 'nobody', label: 'Nobody' },
          ].map(opt => <RadioOption key={opt.value} selected={privacyEndorsements === opt.value} label={opt.label} onPress={() => setPrivacyEndorsements(opt.value)} />)}
        </View>
        <View style={st.privacyGroup}>
          <Text style={st.privacyGroupLabel}>WHO CAN ANNOTATE</Text>
          {[
            { value: 'everyone', label: 'Everyone' },
            { value: 'followers', label: 'Followers Only' },
            { value: 'nobody', label: 'Nobody' },
          ].map(opt => <RadioOption key={opt.value} selected={privacyAnnotations === opt.value} label={opt.label} onPress={() => setPrivacyAnnotations(opt.value)} />)}
        </View>
      </SectionCard>
    </AnimatedView>
  );
}

export function NotificationsSection(props: any) {
  const { notifFollows, setNotifFollows, notifEndorsements, setNotifEndorsements, notifComments, setNotifComments, notifSystem, setNotifSystem } = props;
  return (
    <AnimatedView entering={FadeInDown.duration(500).delay(250)}>
      <SectionCard>
        <SectionHead icon={Bell} label="NOTIFICATIONS" />
        {[
          { label: 'New Followers', desc: 'When someone follows you', value: notifFollows, setter: setNotifFollows },
          { label: 'Certifications', desc: 'When someone certifies your log', value: notifEndorsements, setter: setNotifEndorsements },
          { label: 'Annotations', desc: 'When someone comments on your log', value: notifComments, setter: setNotifComments },
          { label: 'System Alerts', desc: 'Society announcements and updates', value: notifSystem, setter: setNotifSystem },
        ].map((item, idx, arr) => (
          <View key={item.label} style={[st.notifRow, idx === arr.length - 1 && st.notifRowLast]}>
            <View style={st.notifTextWrap}>
              <Text style={st.notifLabel}>{item.label}</Text>
              <Text style={st.notifDesc}>{item.desc}</Text>
            </View>
            <Toggle active={item.value} onToggle={() => item.setter(!item.value)} />
          </View>
        ))}
        <View style={st.pushSection}>
          <View style={st.pushTitleRow}>
            <Smartphone size={10} color={colors.sepia} />
            <Text style={st.pushTitle}>MOBILE INTEGRATION</Text>
          </View>
          <Text style={st.pushDesc}>Receive immediate cinematic alerts directly to your device when the society interacts with your archive.</Text>
        </View>
      </SectionCard>
    </AnimatedView>
  );
}

const st = StyleSheet.create({
  sectionCard: { backgroundColor: '#110D0A', borderWidth: 1, borderColor: '#30261A', borderRadius: 6, marginHorizontal: 16, marginBottom: 16, overflow: 'hidden' },
  sectionCardDanger: { borderColor: 'rgba(162,36,36,0.5)', backgroundColor: 'rgba(162,36,36,0.03)' },
  sectionTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 10 },
  sectionHeaderWrap: { padding: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.15)' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderIcon: { marginTop: -1 },
  sectionHeaderText: { fontFamily: fonts.uiMedium, fontSize: 10, color: colors.sepia, letterSpacing: 2.5 },
  sectionHeaderTextDanger: { color: colors.bloodReel },
  fieldWrap: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  fieldLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 8, textTransform: 'uppercase' },
  fieldBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, marginBottom: 16, paddingHorizontal: 16 },
  microNote: { fontFamily: fonts.ui, fontSize: 7, letterSpacing: 2, color: colors.fog, opacity: 0.6, textAlign: 'center', padding: 16, paddingBottom: 20, borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.1)' },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankDisplay: { fontFamily: fonts.display, fontSize: 18, color: colors.bone },
  rankCinephile: { color: colors.bone },
  rankArchivist: { color: colors.sepia, ...effects.textShadowDeep },
  rankAuteur: { color: colors.bloodReel, fontWeight: 'bold' },
  activeBadge: { borderWidth: 1, borderColor: 'green', backgroundColor: 'rgba(0,255,0,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 2 },
  activeBadgeText: { fontFamily: fonts.uiBold, fontSize: 8, color: 'green', letterSpacing: 1 },
  primaryBtn: { backgroundColor: colors.sepia, paddingVertical: 14, marginHorizontal: 16, borderRadius: 2, alignItems: 'center', ...effects.glowSepia },
  primaryBtnText: { fontFamily: fonts.uiMedium, fontSize: 10, letterSpacing: 2.5, color: colors.ink, fontWeight: '700' },
  dividerSpaced: { height: 1, backgroundColor: 'rgba(139,105,20,0.15)', marginVertical: 16 },
  readonlyField: { backgroundColor: colors.soot, borderWidth: 1, borderColor: '#30261A', padding: 12, borderRadius: 2 },
  readonlyText: { fontFamily: fonts.mono, fontSize: 13, color: colors.fog },
  actionBtnSpaced: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(139,105,20,0.03)' },
  actionBtnTextFlex: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.bone, flex: 1, marginLeft: 10 },
  passwordPanel: { padding: 16, backgroundColor: '#0A0806', borderTopWidth: 1, borderTopColor: '#30261A', gap: 16 },
  fieldInput: { backgroundColor: colors.ink, borderWidth: 1, borderColor: '#30261A', color: colors.parchment, fontFamily: fonts.mono, fontSize: 14, padding: 12, borderRadius: 2 },
  saveFieldBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.sepia, paddingVertical: 12, alignItems: 'center', borderRadius: 2, marginTop: 8 },
  saveFieldBtnText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 2, color: colors.sepia },
  disabledBtn: { opacity: 0.5 },
  privacyGroup: { padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  privacyGroupLabel: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 2, color: colors.fog, marginBottom: 12 },
  radioOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  radioOptionActive: {},
  radioDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: colors.ash, backgroundColor: 'transparent' },
  radioDotActive: { borderColor: colors.sepia, backgroundColor: colors.sepia },
  radioLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.bone },
  radioLabelActive: { color: colors.parchment },
  notifRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  notifRowLast: { borderBottomWidth: 0 },
  notifTextWrap: { flex: 1, paddingRight: 16 },
  notifLabel: { fontFamily: fonts.uiMedium, fontSize: 12, color: colors.bone, marginBottom: 4 },
  notifDesc: { fontFamily: fonts.body, fontSize: 12, color: colors.fog },
  pushSection: { backgroundColor: '#0A0806', padding: 16, borderTopWidth: 1, borderTopColor: '#30261A' },
  pushTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  pushTitle: { fontFamily: fonts.uiMedium, fontSize: 9, letterSpacing: 2, color: colors.sepia },
  pushDesc: { fontFamily: fonts.bodyItalic, fontSize: 11, color: colors.fog, lineHeight: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(139,105,20,0.1)' },
  actionBtnDanger: { borderBottomColor: 'transparent' },
  actionBtnText: { fontFamily: fonts.ui, fontSize: 10, letterSpacing: 1.5, color: colors.bone },
  actionBtnTextDanger: { color: colors.bloodReel },
});
