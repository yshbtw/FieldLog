import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Modal, ScrollView, Platform, TextInput, KeyboardAvoidingView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { useWorkSession } from '../context/WorkSessionContext';
import { formatDuration, formatDate, formatTime, formatCurrency } from '../utils/formatTime';
import { loadDirectoryUri, saveDirectoryUri } from '../services/storageService';

export default function DashboardScreen() {
  const { sessions, deleteSession, updateSession } = useWorkSession();
  const [selectedSession, setSelectedSession] = useState(null);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editRate, setEditRate] = useState('');

  // Audio Playback State
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Edit Mode Audio State
  const [editRecording, setEditRecording] = useState(null);
  const [editAudioUri, setEditAudioUri] = useState(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  // Clean up sound on unmount or when modal closes
  useEffect(() => {
    if (!selectedSession && sound) {
      sound.unloadAsync();
      setSound(null);
      setIsPlaying(false);
    }
    if (!selectedSession) {
      setIsEditing(false);
      setEditRecording(null);
      setEditAudioUri(null);
    }
  }, [selectedSession]);

  useEffect(() => {
    return sound ? () => { sound.unloadAsync(); } : undefined;
  }, [sound]);

  // Sort sessions recent first
  const recentSessions = [...sessions].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );

  const confirmDelete = (id) => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm("Are you sure you want to delete this work session? This will not delete the audio from your device.");
      if (confirmed) {
        deleteSession(id);
        setSelectedSession(null);
      }
      return;
    }

    Alert.alert(
      "Delete Session",
      "Are you sure you want to delete this work session? This will not delete the audio from your device.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive", 
          onPress: () => {
            deleteSession(id);
            setSelectedSession(null);
          }
        }
      ]
    );
  };

  const startEditing = () => {
    setEditDescription(selectedSession.description || '');
    setEditRate(String(selectedSession.hourlyRate || 0));
    setEditAudioUri(selectedSession.audioUri || null);
    // Clean up any existing playback
    if (sound) { sound.unloadAsync(); setSound(null); setIsPlaying(false); }
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (sound) { sound.unloadAsync(); setSound(null); setIsPlaying(false); }
    setEditRecording(null);
    setEditAudioUri(selectedSession.audioUri || null);
    setIsEditing(false);
  };

  // --- EDIT MODE AUDIO FUNCTIONS ---
  async function startEditRecording() {
    try {
      if (permissionResponse?.status !== 'granted') await requestPermission();
      if (sound) { await sound.unloadAsync(); setSound(null); setIsPlaying(false); }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setEditRecording(recording);
      setEditAudioUri(null);
    } catch (err) {
      console.error('Failed to start recording', err);
      alert('Could not start recording. Please check microphone permissions.');
    }
  }

  async function stopEditRecording() {
    if (!editRecording) return;
    await editRecording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    const uri = editRecording.getURI();
    setEditAudioUri(uri);
    setEditRecording(null);
  }

  async function playEditAudio() {
    if (!editAudioUri) return;
    if (sound) {
      if (isPlaying) { await sound.pauseAsync(); setIsPlaying(false); }
      else { await sound.playAsync(); setIsPlaying(true); }
      return;
    }
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: editAudioUri }, { shouldPlay: true });
      setSound(newSound);
      setIsPlaying(true);
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) { setIsPlaying(false); newSound.setPositionAsync(0); }
      });
    } catch (error) {
      console.error('Error playing audio', error);
      alert('Could not play audio.');
    }
  }

  function deleteEditAudio() {
    if (sound) { sound.unloadAsync(); setSound(null); setIsPlaying(false); }
    setEditAudioUri(null);
  }

  const saveEditing = async () => {
    let finalAudioUri = editAudioUri;
    
    // Auto-stop recording if the user hits "Save" while still recording
    if (editRecording) {
      await editRecording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      finalAudioUri = editRecording.getURI();
      setEditAudioUri(finalAudioUri);
      setEditRecording(null);
    }

    const newRate = parseFloat(editRate) || 0;
    const hours = selectedSession.duration / 3600;
    const newEarnings = newRate * hours;

    // If a new audio was recorded, persist it via SAF on Android
    if (finalAudioUri && finalAudioUri !== selectedSession.audioUri && Platform.OS === 'android') {
      try {
        let dirUri = await loadDirectoryUri();
        if (!dirUri) {
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            dirUri = permissions.directoryUri;
            await saveDirectoryUri(dirUri);
          }
        }
        if (dirUri) {
          const safeName = (selectedSession.contactName || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `WorkTime_${safeName}_edit_${Date.now()}.m4a`;
          const newUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, fileName, 'audio/m4a');
          const base64Audio = await FileSystem.readAsStringAsync(finalAudioUri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(newUri, base64Audio, { encoding: FileSystem.EncodingType.Base64 });
          finalAudioUri = newUri;
        }
      } catch (err) {
        console.error('Failed to save edited audio to SAF:', err);
        alert('The previously selected storage folder is no longer writable. Please select a new folder next time you save.');
        await saveDirectoryUri(null); // Clear the invalid directory
      }
    }

    await updateSession(selectedSession.id, {
      description: editDescription,
      hourlyRate: newRate,
      totalEarnings: newEarnings,
      audioUri: finalAudioUri,
    });

    setSelectedSession(prev => ({
      ...prev,
      description: editDescription,
      hourlyRate: newRate,
      totalEarnings: newEarnings,
      audioUri: finalAudioUri,
    }));
    setIsEditing(false);
  };

  async function togglePlayAudio(audioUri) {
    if (!audioUri) return;

    if (sound) {
      if (isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else {
        await sound.playAsync();
        setIsPlaying(true);
      }
      return;
    }

    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true }
      );
      setSound(newSound);
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) {
          setIsPlaying(false);
          newSound.setPositionAsync(0);
        }
      });
    } catch (error) {
      console.error("Error playing audio", error);
      alert('Could not play audio. The file might have been moved or deleted from your device folder.');
    }
  }

  const renderSessionItem = ({ item, index }) => (
    <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
      <TouchableOpacity 
        activeOpacity={0.7} 
        style={styles.sessionCard}
        onPress={() => setSelectedSession(item)}
      >
        
        <View style={styles.sessionHeader}>
          <View style={styles.sessionHeaderLeft}>
            <Text style={styles.contactIcon}>👤</Text>
            <Text style={styles.contactName}>{item.contactName}</Text>
          </View>
          <Text style={styles.sessionDuration}>{formatDuration(item.duration)}</Text>
        </View>
        
        <View style={styles.earningsBadge}>
          <Text style={styles.earningsBadgeText}>{formatCurrency(item.totalEarnings)}</Text>
        </View>
        
        {item.description || item.audioUri ? (
          <View style={styles.descriptionRow}>
            {item.description ? (
              <Text style={styles.sessionDescription} numberOfLines={2}>{item.description}</Text>
            ) : null}
            {item.audioUri && (
              <View style={styles.audioTag}>
                <Text style={styles.audioTagText}>🎤 Voice Note</Text>
              </View>
            )}
          </View>
        ) : null}
        
        <View style={styles.sessionFooter}>
          <Text style={styles.sessionDate}>{formatDate(item.date)}</Text>
          <Text style={styles.timeRangeText}>
            {formatTime(item.startTime)} - {formatTime(item.endTime)}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent Dash</Text>
        <Text style={styles.subtitle}>
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} total
        </Text>
      </View>

      <Animated.FlatList
        data={recentSessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📭</Text>
            <Text style={styles.emptyText}>No sessions recorded yet.</Text>
            <Text style={styles.emptySubtext}>Head over to the Timer tab to start tracking time.</Text>
          </View>
        }
        renderItem={renderSessionItem}
      />

      {/* DETAILED SESSION MODAL */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={!!selectedSession}
        onRequestClose={() => setSelectedSession(null)}
      >
        <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
          {selectedSession && (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{isEditing ? 'Edit Session' : 'Session Details'}</Text>
                <TouchableOpacity onPress={() => { setIsEditing(false); setSelectedSession(null); }}>
                  <Text style={styles.closeText}>Close</Text>
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40}}>
                
                <View style={styles.detailHeaderCard}>
                  <View style={styles.avatarLarge}>
                    <LinearGradient colors={['#818CF8', '#6366F1']} style={StyleSheet.absoluteFillObject} />
                    <Text style={styles.avatarTextLarge}>{selectedSession.contactName?.[0]?.toUpperCase()}</Text>
                  </View>
                  <Text style={styles.detailContactName}>{selectedSession.contactName}</Text>
                  <Text style={styles.detailDate}>{formatDate(selectedSession.date)}</Text>
                </View>

                <View style={styles.statsGrid}>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Duration</Text>
                    <Text style={styles.statValue}>{formatDuration(selectedSession.duration)}</Text>
                  </View>
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>Earnings</Text>
                    <Text style={[styles.statValue, {color: '#10B981'}]}>{formatCurrency(selectedSession.totalEarnings)}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Time Span</Text>
                  <Text style={styles.infoValue}>
                    {formatTime(selectedSession.startTime)} to {formatTime(selectedSession.endTime)}
                  </Text>
                </View>

                {/* Hourly Rate — editable or read-only */}
                {isEditing ? (
                  <View style={styles.editFieldContainer}>
                    <Text style={styles.editFieldLabel}>Hourly Rate ($)</Text>
                    <TextInput
                      style={styles.editInput}
                      value={editRate}
                      onChangeText={setEditRate}
                      keyboardType="decimal-pad"
                      placeholder="0.00"
                      placeholderTextColor="#9CA3AF"
                    />
                  </View>
                ) : (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Hourly Rate</Text>
                    <Text style={styles.infoValue}>
                      {formatCurrency(selectedSession.hourlyRate || 0)} / hr
                    </Text>
                  </View>
                )}

                {/* Description — editable or read-only */}
                <Text style={styles.descLabel}>Work Description</Text>
                {isEditing ? (
                  <TextInput
                    style={styles.editDescInput}
                    value={editDescription}
                    onChangeText={setEditDescription}
                    multiline
                    numberOfLines={5}
                    placeholder="Describe the work done..."
                    placeholderTextColor="#9CA3AF"
                    textAlignVertical="top"
                  />
                ) : (
                  <View style={styles.descBox}>
                    <Text style={styles.descText}>{selectedSession.description || 'No description'}</Text>
                  </View>
                )}

                {/* Voice Note — editable or read-only */}
                {isEditing ? (
                  <View style={styles.audioEditSection}>
                    <Text style={styles.descLabel}>Voice Note</Text>
                    {!editAudioUri && !editRecording && (
                      <TouchableOpacity style={styles.recordEditBtn} onPress={startEditRecording}>
                        <Text style={styles.recordEditBtnIcon}>⏺️</Text>
                        <Text style={styles.recordEditBtnText}>Record Voice Note</Text>
                      </TouchableOpacity>
                    )}
                    {editRecording && (
                      <TouchableOpacity style={[styles.recordEditBtn, styles.recordingActiveBtn]} onPress={stopEditRecording}>
                        <Text style={styles.recordEditBtnIcon}>⏹️</Text>
                        <Text style={styles.recordEditBtnText}>Stop Recording</Text>
                      </TouchableOpacity>
                    )}
                    {editAudioUri && !editRecording && (
                      <View style={styles.audioEditPlayer}>
                        <Text style={styles.audioEditLabel}>🎤 Voice Note Ready</Text>
                        <View style={styles.audioEditControls}>
                          <TouchableOpacity style={styles.audioEditPlayBtn} onPress={playEditAudio}>
                            <Text style={styles.audioEditPlayBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.audioEditReplaceBtn} onPress={() => { deleteEditAudio(); startEditRecording(); }}>
                            <Text style={styles.audioEditReplaceBtnText}>🔄 Replace</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.audioEditDeleteBtn} onPress={deleteEditAudio}>
                            <Text style={styles.audioEditDeleteBtnText}>🗑</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                ) : (
                  selectedSession.audioUri ? (
                    <View style={styles.audioViewer}>
                      <Text style={styles.audioLabel}>🎤 Voice Note Attached</Text>
                      <TouchableOpacity 
                        style={styles.playAudioBtn} 
                        onPress={() => togglePlayAudio(selectedSession.audioUri)}
                      >
                        <Text style={styles.playAudioBtnText}>
                          {isPlaying ? '⏸ Pause Playback' : '▶ Play Voice Note'}
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.audioUriText} numberOfLines={1}>URI: {selectedSession.audioUri}</Text>
                    </View>
                  ) : null
                )}

                {/* Action Buttons */}
                {isEditing ? (
                  <View style={styles.editActions}>
                    <TouchableOpacity style={styles.saveActionBtn} onPress={saveEditing}>
                      <Text style={styles.saveActionBtnText}>Save Changes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cancelEditBtn} onPress={cancelEditing}>
                      <Text style={styles.cancelEditBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.editActions}>
                    <TouchableOpacity style={styles.editActionBtn} onPress={startEditing}>
                      <Text style={styles.editActionBtnText}>✏️  Edit Session</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      style={styles.deleteActionBtn} 
                      onPress={() => confirmDelete(selectedSession.id)}
                    >
                      <Text style={styles.deleteActionBtnText}>Delete Session Log</Text>
                    </TouchableOpacity>
                  </View>
                )}

              </ScrollView>
            </KeyboardAvoidingView>
          )}
        </BlurView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  header: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24 },
  title: { fontSize: 32, fontWeight: '800', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  listContent: { paddingHorizontal: 24, paddingBottom: 100 }, // Extra padding for floating tab bar
  
  sessionCard: { 
    backgroundColor: '#FFFFFF', 
    borderRadius: 24, 
    padding: 20, 
    marginBottom: 20, 
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 5,
  },
  sessionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sessionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  contactIcon: { fontSize: 18, marginRight: 8 },
  contactName: { fontSize: 18, fontWeight: '700', color: '#111827' },
  sessionDuration: { fontSize: 18, fontWeight: '700', color: '#2563EB', fontVariant: ['tabular-nums'] },
  
  earningsBadge: { alignSelf: 'flex-start', backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginBottom: 16 },
  earningsBadgeText: { color: '#16A34A', fontWeight: '800', fontSize: 14 },
  descriptionRow: { marginBottom: 16 },
  sessionDescription: { fontSize: 15, color: '#4B5563', lineHeight: 22, marginBottom: 8 },
  
  audioTag: { alignSelf: 'flex-start', backgroundColor: '#EEF2FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  audioTagText: { fontSize: 13, color: '#4F46E5', fontWeight: '700' },
  
  sessionFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  sessionDate: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  timeRangeText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 64, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 64, marginBottom: 24 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 12 },
  emptySubtext: { fontSize: 16, color: '#6B7280', textAlign: 'center', lineHeight: 24 },

  // Modal Styles
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.25)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F2F2F7', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#111827' },
  closeText: { fontSize: 16, color: '#2563EB', fontWeight: '700' },
  
  detailHeaderCard: { alignItems: 'center', paddingVertical: 24, backgroundColor: '#FFFFFF', borderRadius: 24, marginBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  avatarLarge: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden' },
  avatarTextLarge: { color: '#FFFFFF', fontSize: 32, fontWeight: '800' },
  detailContactName: { fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 4 },
  detailDate: { fontSize: 15, color: '#6B7280', fontWeight: '500' },
  
  statsGrid: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statBox: { flex: 1, backgroundColor: '#FFFFFF', padding: 20, borderRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  statLabel: { fontSize: 14, color: '#6B7280', marginBottom: 8, fontWeight: '600' },
  statValue: { fontSize: 24, fontWeight: '800', color: '#2563EB' },
  
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  infoLabel: { fontSize: 16, color: '#6B7280', fontWeight: '500' },
  infoValue: { fontSize: 16, color: '#111827', fontWeight: '700' },
  
  descLabel: { fontSize: 16, color: '#6B7280', marginTop: 24, marginBottom: 12, fontWeight: '600' },
  descBox: { backgroundColor: '#FFFFFF', padding: 20, borderRadius: 24, minHeight: 120, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  descText: { color: '#374151', fontSize: 16, lineHeight: 26 },
  
  audioViewer: { marginTop: 24, backgroundColor: '#EEF2FF', padding: 20, borderRadius: 24 },
  audioLabel: { color: '#4F46E5', fontWeight: '700', marginBottom: 16, fontSize: 16 },
  
  playAudioBtn: { backgroundColor: '#111827', paddingVertical: 16, borderRadius: 30, alignItems: 'center', marginBottom: 12 },
  playAudioBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
  
  audioUriText: { color: '#6B7280', fontSize: 12 },
  
  editActions: { marginTop: 32, gap: 12 },

  editActionBtn: { backgroundColor: '#EEF2FF', paddingVertical: 16, borderRadius: 30, alignItems: 'center' },
  editActionBtnText: { color: '#4F46E5', fontSize: 16, fontWeight: '800' },

  saveActionBtn: { backgroundColor: '#111827', paddingVertical: 16, borderRadius: 30, alignItems: 'center' },
  saveActionBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },

  cancelEditBtn: { backgroundColor: '#F3F4F6', paddingVertical: 16, borderRadius: 30, alignItems: 'center' },
  cancelEditBtnText: { color: '#6B7280', fontSize: 16, fontWeight: '700' },

  deleteActionBtn: { backgroundColor: '#FEF2F2', paddingVertical: 16, borderRadius: 30, alignItems: 'center' },
  deleteActionBtnText: { color: '#DC2626', fontSize: 16, fontWeight: '800' },

  editFieldContainer: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  editFieldLabel: { fontSize: 14, color: '#6B7280', marginBottom: 8, fontWeight: '600' },
  editInput: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, fontSize: 18, fontWeight: '700', color: '#111827', borderWidth: 1, borderColor: '#E5E7EB' },

  editDescInput: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, fontSize: 16, lineHeight: 26, color: '#374151', minHeight: 140, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },

  // Edit Audio Styles
  audioEditSection: { marginTop: 8 },
  recordEditBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, backgroundColor: '#EEF2FF', borderRadius: 20, marginTop: 8 },
  recordingActiveBtn: { backgroundColor: '#FEF2F2' },
  recordEditBtnIcon: { fontSize: 20, marginRight: 10 },
  recordEditBtnText: { color: '#4F46E5', fontWeight: '800', fontSize: 16 },

  audioEditPlayer: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20, marginTop: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  audioEditLabel: { color: '#4F46E5', fontSize: 15, fontWeight: '800', marginBottom: 14 },
  audioEditControls: { flexDirection: 'row', gap: 10 },
  audioEditPlayBtn: { flex: 2, backgroundColor: '#EEF2FF', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  audioEditPlayBtnText: { color: '#4F46E5', fontWeight: '800', fontSize: 15 },
  audioEditReplaceBtn: { flex: 2, backgroundColor: '#FFF7ED', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  audioEditReplaceBtnText: { color: '#D97706', fontWeight: '800', fontSize: 15 },
  audioEditDeleteBtn: { flex: 1, backgroundColor: '#FEF2F2', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  audioEditDeleteBtnText: { color: '#DC2626', fontWeight: '800', fontSize: 18 },
});
