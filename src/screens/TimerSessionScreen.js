import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Platform, ScrollView, Pressable } from 'react-native';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withRepeat, withTiming, withSequence, Easing } from 'react-native-reanimated';
import { useWorkSession } from '../context/WorkSessionContext';
import { formatDuration, formatCurrency } from '../utils/formatTime';
import { loadDirectoryUri, saveDirectoryUri } from '../services/storageService';

export default function TimerSessionScreen({ route, navigation }) {
  const { contactName, contactId } = route.params;
  const { timerState, setTimerState, addSession } = useWorkSession();

  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [modalVisible, setModalVisible] = useState(false);
  const [description, setDescription] = useState('');
  
  // Audio Recording State
  const [recording, setRecording] = useState(null);
  const [audioUri, setAudioUri] = useState(null);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  // Audio Playback State
  const [sound, setSound] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Rate State
  const [hourlyRate, setHourlyRate] = useState('');
  const [computedDuration, setComputedDuration] = useState(0);

  // Payment Status State
  const [paidStatus, setPaidStatus] = useState('unpaid');
  const [paidAmount, setPaidAmount] = useState('');

  // Reanimated Shared Values
  const timerScale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const pauseScale = useSharedValue(1);
  const stopScale = useSharedValue(1);

  // Sync elapsed time from global timer State
  useEffect(() => {
    let interval;
    if (timerState.status === 'running' && timerState.contact?.id === contactId) {
      interval = setInterval(() => {
        const now = Date.now();
        const currentElapsedMs = timerState.accumulatedTime + (now - timerState.startTime);
        setElapsedSeconds(Math.floor(currentElapsedMs / 1000));
      }, 500);

      // Heartbeat pulse animation for active timer
      timerScale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) })
        ),
        -1, // infinite
        true // reverse
      );

    } else if (timerState.contact?.id === contactId) {
      setElapsedSeconds(Math.floor(timerState.accumulatedTime / 1000));
      timerScale.value = withSpring(1); // Reset scale safely
    } else {
      setElapsedSeconds(0);
      timerScale.value = withSpring(1);
    }
    return () => clearInterval(interval);
  }, [timerState, contactId]);

  // Spring animations for buttons
  const animatedStartStyle = useAnimatedStyle(() => ({ transform: [{ scale: startScale.value }] }));
  const animatedPauseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pauseScale.value }] }));
  const animatedStopStyle = useAnimatedStyle(() => ({ transform: [{ scale: stopScale.value }] }));
  const animatedTimerStyle = useAnimatedStyle(() => ({ transform: [{ scale: timerScale.value }] }));

  // Clean up sound on unmount
  useEffect(() => {
    return sound
      ? () => {
          sound.unloadAsync();
        }
      : undefined;
  }, [sound]);

  // Handle starting the timer
  const handleStart = () => {
    if (timerState.status !== 'idle' && timerState.contact?.id !== contactId) {
      alert('Another timer is already active. Please stop it first.');
      return;
    }
    setTimerState({
      status: 'running',
      startTime: Date.now(),
      accumulatedTime: timerState.accumulatedTime || 0,
      contact: { id: contactId, name: contactName },
    });
  };

  const handlePause = () => {
    if (timerState.status !== 'running') return;
    const now = Date.now();
    const additionalTime = now - timerState.startTime;
    setTimerState({
      ...timerState,
      status: 'paused',
      startTime: null,
      accumulatedTime: timerState.accumulatedTime + additionalTime,
    });
  };

  const handleStop = () => {
    const finalSeconds = timerState.status === 'running' 
      ? Math.floor((timerState.accumulatedTime + (Date.now() - timerState.startTime)) / 1000)
      : Math.floor(timerState.accumulatedTime / 1000);

    setComputedDuration(finalSeconds);

    if (timerState.status === 'running') {
      const now = Date.now();
      const additionalTime = now - timerState.startTime;
      setTimerState({
        ...timerState,
        status: 'paused',
        startTime: null,
        accumulatedTime: timerState.accumulatedTime + additionalTime,
      });
    }

    setModalVisible(true);
  };

  // --- AUDIO LOGIC ---
  async function startRecording() {
    try {
      if (permissionResponse?.status !== 'granted') await requestPermission();
      
      // Stop any playback before recording
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
      }

      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
      setAudioUri(null);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  }

  async function stopRecording() {
    setRecording(undefined);
    await recording.stopAndUnloadAsync();
    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    const uri = recording.getURI();
    setAudioUri(uri);
  }

  async function playAudio() {
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
    }
  }

  async function deleteAudio() {
    if (sound) {
      await sound.unloadAsync();
      setSound(null);
      setIsPlaying(false);
    }
    setAudioUri(null);
  }

  // --- SAVE SESSION & SAF DIRECTORY LOGIC ---
  const handleSaveSession = async () => {
    if (computedDuration <= 0) {
      alert("Duration must be greater than 0. Check your timer.");
      return;
    }

    // Determine absolute Start and End times cleanly from stopwatch duration
    const eDate = new Date();
    const sDate = new Date(eDate.getTime() - (computedDuration * 1000));
    
    const rateVal = parseFloat(hourlyRate) || 0;
    const earnings = (computedDuration / 3600) * rateVal;

    let finalAudioUri = audioUri;

    // Local Folder Saving (SAF on Android)
    if (finalAudioUri && Platform.OS === 'android') {
      try {
        let dirUri = await loadDirectoryUri();
        if (!dirUri) {
          alert('First time saving audio! Please pick a device folder to securely save all your WorkTime data.');
          const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (permissions.granted) {
            dirUri = permissions.directoryUri;
            await saveDirectoryUri(dirUri);
          }
        }

        if (dirUri) {
          // move the cache audio to the persistent SAF folder
          const safeContactName = contactName.replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `WorkTime_${safeContactName}_${Date.now()}.m4a`;
          
          // Create the file in the selected directory
          const finalUri = await FileSystem.StorageAccessFramework.createFileAsync(
            dirUri,
            fileName,
            'audio/m4a'
          );
          
          // Read from cache and write to SAF
          const base64Audio = await FileSystem.readAsStringAsync(finalAudioUri, { encoding: FileSystem.EncodingType.Base64 });
          await FileSystem.writeAsStringAsync(finalUri, base64Audio, { encoding: FileSystem.EncodingType.Base64 });
          
          finalAudioUri = finalUri;
        }
      } catch (err) {
        console.error("Failed to save audio to SAF:", err);
        alert('The previously selected storage folder is no longer writable (or was moved/deleted). Please select a new folder next time.');
        await saveDirectoryUri(null); // Clear the invalid directory
        // Continue fallback to cache
      }
    }

    const extraPaidAmount = parseFloat(paidAmount) || 0;

    if (paidStatus === 'partial' && extraPaidAmount > earnings) {
      alert(`Overpayment Alert: Partial amount (${formatCurrency(extraPaidAmount)}) cannot be greater than total earnings (${formatCurrency(earnings)}).`);
      return;
    }

    let finalPaidStatus = paidStatus;
    let finalPaidAmount = 0;

    if (paidStatus === 'paid') {
      finalPaidAmount = earnings;
    } else if (paidStatus === 'partial') {
      if (Math.abs(extraPaidAmount - earnings) < 0.01 || extraPaidAmount > earnings) {
        // Automatically mark as paid if equal
        finalPaidStatus = 'paid';
        finalPaidAmount = earnings;
      } else {
        finalPaidAmount = extraPaidAmount;
      }
    }

    const entry = {
      id: Date.now().toString(),
      contactName: contactName,
      contactId: contactId,
      startTime: sDate.toISOString(),
      endTime: eDate.toISOString(),
      duration: computedDuration,
      description: description.trim() || 'No description provided',
      date: eDate.toISOString().split('T')[0],
      audioUri: finalAudioUri,
      hourlyRate: rateVal,
      totalEarnings: earnings,
      paidStatus: finalPaidStatus,
      paidAmount: finalPaidAmount,
    };
    
    await addSession(entry);

    if (sound) await sound.unloadAsync();
    setSound(null);
    setIsPlaying(false);
    setRecording(null);
    setAudioUri(null);
    setDescription('');
    setHourlyRate('');
    setPaidStatus('unpaid');
    setPaidAmount('');

    setTimerState({
      status: 'idle',
      startTime: null,
      accumulatedTime: 0,
      contact: null,
    });
    
    setModalVisible(false);
    navigation.goBack();
  };

  const isRunning = timerState.status === 'running' && timerState.contact?.id === contactId;
  const isPaused = timerState.status === 'paused' && timerState.contact?.id === contactId && timerState.accumulatedTime > 0;
  const isIdle = !isRunning && !isPaused;

  // Live Earnings Preview for Modal
  const rateNum = parseFloat(hourlyRate) || 0;
  const previewEarnings = (computedDuration / 3600) * rateNum;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Contact Info (Glassmorphism) */}
        <View style={styles.contactGlassCard}>
          <View style={styles.contactAvatar}>
            <LinearGradient colors={['#818CF8', '#6366F1']} style={StyleSheet.absoluteFillObject} />
            <Text style={styles.contactAvatarText}>{contactName?.[0]?.toUpperCase() || '?'}</Text>
          </View>
          <Text style={styles.contactName}>{contactName}</Text>
          <Text style={styles.contactLabel}>Focus Session</Text>
        </View>

        {/* Huge dynamic timer display */}
        <Animated.View style={[styles.timerWrapper, animatedTimerStyle]}>
          <Text style={[styles.timerText, isRunning && styles.timerTextActive]}>
            {formatDuration(elapsedSeconds)}
          </Text>
        </Animated.View>

        {/* Controls */}
        <View style={styles.controlsContainer}>
          {(isIdle || isPaused) && (
            <Animated.View style={animatedStartStyle}>
              <Pressable 
                style={styles.controlCircle} 
                onPressIn={() => startScale.value = withSpring(0.85)}
                onPressOut={() => startScale.value = withSpring(1)}
                onPress={handleStart}
              >
                <LinearGradient colors={['#34D399', '#10B981']} style={styles.gradientCircle} />
                <Text style={styles.iconLarge}>▶</Text>
              </Pressable>
            </Animated.View>
          )}

          {isRunning && (
            <Animated.View style={animatedPauseStyle}>
              <Pressable 
                style={styles.controlCircle} 
                onPressIn={() => pauseScale.value = withSpring(0.85)}
                onPressOut={() => pauseScale.value = withSpring(1)}
                onPress={handlePause}
              >
                <LinearGradient colors={['#FBBF24', '#F59E0B']} style={styles.gradientCircle} />
                <Text style={styles.iconLarge}>⏸</Text>
              </Pressable>
            </Animated.View>
          )}

          {(!isIdle) && (
            <Animated.View style={animatedStopStyle}>
              <Pressable 
                style={styles.controlCircle} 
                onPressIn={() => stopScale.value = withSpring(0.85)}
                onPressOut={() => stopScale.value = withSpring(1)}
                onPress={handleStop}
              >
                <LinearGradient colors={['#F87171', '#EF4444']} style={styles.gradientCircle} />
                <Text style={styles.iconLarge}>⏹</Text>
              </Pressable>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Save Session Action Sheet / Modal */}
      <Modal animationType="slide" transparent={true} visible={modalVisible} onRequestClose={() => setModalVisible(false)}>
        <BlurView intensity={90} tint="dark" style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Save Session</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Text style={styles.closeText}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{paddingBottom: 40}}>
              
              <Text style={styles.derivedDuration}>
                Log Time: <Text style={{color: '#38BDF8'}}>{formatDuration(computedDuration)}</Text>
              </Text>

              <Text style={styles.fieldLabel}>Hourly Rate (₹/hr)</Text>
              <View style={styles.rateInputWrapper}>
                <Text style={styles.rateCurrency}>₹</Text>
                <TextInput
                  style={styles.rateInput}
                  value={hourlyRate}
                  onChangeText={setHourlyRate}
                  placeholder="0"
                  placeholderTextColor="#64748B"
                  keyboardType="numeric"
                />
              </View>

              <Text style={styles.fieldLabel}>Work Description</Text>
              <TextInput
                style={styles.textInput}
                placeholder="What did you do? (Dictate using keyboard microphone)"
                placeholderTextColor="#64748B"
                value={description}
                onChangeText={setDescription}
                multiline
              />

              {/* AUDIO RECORDER / PLAYER VIEW */}
              {!audioUri && !recording && (
                <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
                  <Text style={styles.recordButtonIcon}>⏺️</Text>
                  <Text style={styles.recordButtonText}>Record Voice Note</Text>
                </TouchableOpacity>
              )}

              {recording && (
                <TouchableOpacity style={[styles.recordButton, styles.recordingActive]} onPress={stopRecording}>
                  <Text style={styles.recordButtonIcon}>⏹️</Text>
                  <Text style={styles.recordButtonText}>Stop Recording</Text>
                </TouchableOpacity>
              )}

              {audioUri && !recording && (
                <View style={styles.audioPlayerContainer}>
                  <View style={styles.audioInfo}>
                    <Text style={styles.audioTagText}>🎤 Audio Note Attached</Text>
                  </View>
                  <View style={styles.audioControls}>
                    <TouchableOpacity style={styles.audioActionBtn} onPress={playAudio}>
                      <Text style={styles.audioActionBtnText}>{isPlaying ? '⏸ Pause' : '▶ Play'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.audioActionBtn, styles.deleteAudioBtn]} onPress={deleteAudio}>
                      <Text style={styles.deleteAudioBtnText}>🗑 Delete</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.earningsPreview}>
                <Text style={styles.earningsPreviewLabel}>Total Earnings</Text>
                <Text style={styles.earningsPreviewValue}>{formatCurrency(previewEarnings)}</Text>
              </View>

              {/* Payment Status */}
              <Text style={styles.fieldLabel}>Payment Status</Text>
              <View style={styles.paymentToggles}>
                {['unpaid', 'partial', 'paid'].map(status => {
                  const isActive = paidStatus === status;
                  return (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.paymentToggleBtn,
                        isActive && (
                          status === 'paid' ? styles.paymentTogglePaid :
                          status === 'partial' ? styles.paymentTogglePartial :
                          styles.paymentToggleUnpaid
                        )
                      ]}
                      onPress={() => setPaidStatus(status)}
                    >
                      <Text style={[
                        styles.paymentToggleText,
                        isActive && styles.paymentToggleTextActive
                      ]}>
                        {status === 'paid' ? '✅ Paid' : status === 'partial' ? '🟡 Partial' : '🔴 Unpaid'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {paidStatus === 'partial' && (
                <View style={styles.partialAmountRow}>
                  <Text style={styles.partialAmountLabel}>Amount Received (₹)</Text>
                  <TextInput
                    style={styles.partialAmountInput}
                    value={paidAmount}
                    onChangeText={setPaidAmount}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor="#9CA3AF"
                  />
                  {parseFloat(paidAmount) > previewEarnings && (
                    <Text style={styles.errorText}>Please enter correct amount or mark as Paid</Text>
                  )}
                </View>
              )}

              <TouchableOpacity style={styles.saveActionBtn} onPress={handleSaveSession}>
                <LinearGradient colors={['#38BDF8', '#0284C7']} style={StyleSheet.absoluteFillObject} borderRadius={16} />
                <Text style={styles.saveActionBtnText}>Save Session</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </BlurView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F2F2F7' },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 64 },
  
  contactGlassCard: { width: '100%', alignItems: 'center', paddingVertical: 32, borderRadius: 32, marginBottom: 48, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 5 },
  contactAvatar: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden', shadowColor: '#6366F1', shadowOffset: {width: 0, height: 8}, shadowOpacity: 0.3, shadowRadius: 16 },
  contactAvatarText: { color: '#FFFFFF', fontSize: 36, fontWeight: '800' },
  contactName: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 6 },
  contactLabel: { fontSize: 16, color: '#6B7280', fontWeight: '500' },

  timerWrapper: { marginBottom: 64 },
  timerText: { fontSize: 80, fontWeight: '200', color: '#9CA3AF', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  timerTextActive: { color: '#111827', fontWeight: '300' },

  controlsContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
  controlCircle: { width: 88, height: 88, borderRadius: 44, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: {width: 0, height: 10}, shadowOpacity: 0.2, shadowRadius: 20, elevation: 8 },
  gradientCircle: { ...StyleSheet.absoluteFillObject },
  iconLarge: { fontSize: 36, color: '#FFF' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#F2F2F7', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, maxHeight: '90%', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.1, shadowRadius: 20, elevation: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 },
  modalTitle: { fontSize: 26, fontWeight: '800', color: '#111827' },
  closeText: { fontSize: 16, color: '#4F46E5', fontWeight: '700' },

  fieldLabel: { fontSize: 15, fontWeight: '700', color: '#4B5563', marginBottom: 10, marginTop: 24 },
  derivedDuration: { fontSize: 24, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 20 },
  
  rateInputWrapper: { backgroundColor: '#FFFFFF', borderRadius: 16, paddingHorizontal: 20, height: 60, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2 },
  rateCurrency: { color: '#10B981', marginRight: 12, fontSize: 22, fontWeight: '700' },
  rateInput: { flex: 1, color: '#111827', fontSize: 20, fontWeight: '700', ...Platform.select({ web: { outlineStyle: 'none' } }) },

  textInput: { backgroundColor: '#FFFFFF', borderRadius: 16, color: '#111827', padding: 20, minHeight: 120, textAlignVertical: 'top', fontSize: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2, ...Platform.select({ web: { outlineStyle: 'none' } }) },

  recordButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 18, backgroundColor: '#EEF2FF', borderRadius: 16, marginBottom: 32 },
  recordingActive: { backgroundColor: '#FEF2F2' },
  recordButtonIcon: { fontSize: 20, marginRight: 12 },
  recordButtonText: { color: '#4F46E5', fontWeight: '800', fontSize: 16 },

  audioPlayerContainer: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.03, shadowRadius: 10, elevation: 2, marginBottom: 32 },
  audioInfo: { marginBottom: 16 },
  audioTagText: { color: '#4F46E5', fontSize: 15, fontWeight: '800' },
  audioControls: { flexDirection: 'row', gap: 12 },
  audioActionBtn: { flex: 1, backgroundColor: '#EEF2FF', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  audioActionBtnText: { color: '#4F46E5', fontWeight: '800', fontSize: 15 },
  deleteAudioBtn: { backgroundColor: '#FEF2F2' },
  deleteAudioBtnText: { color: '#DC2626', fontWeight: '800', fontSize: 15 },

  earningsPreview: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F0FDF4', padding: 24, borderRadius: 20, marginBottom: 40 },
  earningsPreviewLabel: { fontSize: 17, color: '#16A34A', fontWeight: '700' },
  earningsPreviewValue: { fontSize: 28, color: '#15803D', fontWeight: '800' },

  saveActionBtn: { height: 60, borderRadius: 30, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 16, elevation: 6 },
  saveActionBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },

  // Payment Toggles
  paymentToggles: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  paymentToggleBtn: { flex: 1, paddingVertical: 14, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center' },
  paymentTogglePaid: { backgroundColor: '#DCFCE7' },
  paymentTogglePartial: { backgroundColor: '#FEF9C3' },
  paymentToggleUnpaid: { backgroundColor: '#FEE2E2' },
  paymentToggleText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  paymentToggleTextActive: { color: '#111827' },
  partialAmountRow: { marginBottom: 24 },
  partialAmountLabel: { fontSize: 14, color: '#6B7280', fontWeight: '600', marginBottom: 8 },
  partialAmountInput: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, fontSize: 18, fontWeight: '700', color: '#111827', borderWidth: 1, borderColor: '#E5E7EB' },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: 4, fontWeight: '600' },
});
